import type { AnimeProvider } from '../../providers/types';
import { searchProviders, allProviders } from '../../providers/registry';
import { markHealth } from '../../providers/registry';
import type { Card, SourceResult } from '../types';
import { cached } from '../client';
import { matchScore } from '../utils/fuzzyMatch';

/** Jalankan promise dengan batas waktu agar satu provider lambat tak menahan semua. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * ProviderAggregator — menjalankan semua provider secara paralel
 * (Promise.allSettled) dan melaporkan status per sumber.
 */
export const ProviderAggregator = {
  /** Pencarian paralel dari semua provider yang mendukung pencarian. */
  async search(query: string, opts: { timeout?: number; max?: number } = {}): Promise<SourceResult[]> {
    const q = String(query || '').trim();
    if (!q) return [];
    const timeout = opts.timeout || 12000;
    const providers = searchProviders().slice(0, opts.max || 99);

    const settled = await Promise.allSettled(
      providers.map(p =>
        withTimeout(
          cached<Card[]>('search:' + p.id + ':' + q.toLowerCase(), 5 * 60 * 1000, () => p.search(q)),
          timeout
        ).then(items => ({ p, items }))
      )
    );

    return settled.map((r, i) => {
      const p = providers[i];
      if (r.status === 'fulfilled') {
        const items = (r.value.items || []).map(c => ({ ...c, match: matchScore(q, c.title) }));
        markHealth(p.id, true);
        return { id: p.id, ok: true, count: items.length, items } as SourceResult;
      }
      markHealth(p.id, false, String((r.reason && r.reason.message) || r.reason || 'error'));
      return {
        id: p.id,
        ok: false,
        count: 0,
        items: [],
        error: String((r.reason && r.reason.message) || r.reason || 'error')
      } as SourceResult;
    });
  },

  /** Ambil beranda semua provider stream, digabung tanpa duplikat judul. */
  async home(opts: { timeout?: number } = {}): Promise<{
    ongoing: Card[];
    completed: Card[];
    movie: Card[];
    sources: SourceResult[];
  }> {
    const timeout = opts.timeout || 15000;
    const providers = allProviders().filter(p => p.active && !p.movieOnly);
    const settled = await Promise.allSettled(
      providers.map(p =>
        withTimeout(
          cached('home:' + p.id, 10 * 60 * 1000, () => p.home()),
          timeout
        ).then(data => ({ p, data }))
      )
    );

    const ongoing: Card[] = [];
    const completed: Card[] = [];
    const movie: Card[] = [];
    const sources: SourceResult[] = [];

    settled.forEach((r, i) => {
      const p = providers[i];
      if (r.status === 'fulfilled') {
        const d = r.value.data;
        ongoing.push(...(d.ongoing || []));
        completed.push(...(d.completed || []));
        movie.push(...(d.movie || []));
        markHealth(p.id, true);
        sources.push({ id: p.id, ok: true, count: (d.ongoing || []).length + (d.completed || []).length, items: [] });
      } else {
        markHealth(p.id, false, String((r.reason && r.reason.message) || r.reason || 'error'));
        sources.push({ id: p.id, ok: false, count: 0, items: [], error: String((r.reason && r.reason.message) || '') });
      }
    });

    return { ongoing: dedupe(ongoing), completed: dedupe(completed), movie: dedupe(movie), sources };
  },

  /** Health check ringan: cukup panggil home() provider dan catat hasilnya. */
  async check(provider: AnimeProvider): Promise<boolean> {
    try {
      await withTimeout(provider.home(), 12000);
      markHealth(provider.id, true);
      return true;
    } catch (e: any) {
      markHealth(provider.id, false, String(e?.message || e));
      return false;
    }
  }
};

/** Buang kartu dengan judul sama (case-insensitive), mempertahankan yang pertama. */
export function dedupe(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of cards) {
    const k = String(c.title || '').toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
