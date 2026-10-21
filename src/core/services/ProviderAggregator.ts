import type { AnimeProvider } from '../../providers/types';
import { searchProviders, allProviders, officialProviders } from '../../providers/registry';
import { markHealth } from '../../providers/registry';
import type { Card, ListResult, ScheduleGroup, ScheduleItem, SourceResult } from '../types';
import { CacheManager, TTL } from './CacheManager';
import { matchScore } from '../utils/fuzzyMatch';
import { filterDiscovery } from './ContentPolicy';

/** Jalankan promise dengan batas waktu agar satu penyedia lambat tak menahan semua. */
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

const DAY_KEYS = [
  ['minggu', 'sunday', 'sun'],
  ['senin', 'monday', 'mon'],
  ['selasa', 'tuesday', 'tue'],
  ['rabu', 'wednesday', 'wed'],
  ['kamis', 'thursday', 'thu'],
  ['jumat', 'jum', 'friday', 'fri'],
  ['sabtu', 'saturday', 'sat']
];

export interface ProviderMetric { provider: string; operation: 'search' | 'home' | 'schedule'; ms: number; ok: boolean; count: number; cache?: 'hit' | 'miss' }
const metrics: ProviderMetric[] = [];
export function providerMetrics(): ProviderMetric[] { return metrics.slice(-200); }
function recordMetric(metric: ProviderMetric): void { metrics.push(metric); if (metrics.length > 200) metrics.splice(0, metrics.length - 200); }

export function isProviderSearchAllowed(
  provider: Pick<AnimeProvider, 'id' | 'content'>,
  providerIds?: string[],
  includeAdult = false
): boolean {
  const listed = !providerIds?.length || providerIds.includes(provider.id);
  if (provider.content === 'hentai') return listed && (includeAdult || !!providerIds?.includes(provider.id));
  return listed;
}

function isMovieCard(card: Card): boolean {
  return /movie|film|gekijouban|the movie/i.test(`${card.type || ''} ${card.title || ''} ${card.sub || ''}`);
}

/** Indeks hari (0=Minggu … 6=Sabtu) dari nama hari apa pun; -1 bila tak dikenali. */
export function dayIndex(raw: string): number {
  const s = String(raw || '').toLowerCase();
  for (let i = 0; i < DAY_KEYS.length; i++) {
    if (DAY_KEYS[i].some(k => s.indexOf(k) > -1)) return i;
  }
  return -1;
}

/** Ubah jam tayang ("20:00", "20.00 WIB") menjadi menit; tak dikenal → paling akhir. */
export function timeToMinutes(raw: string): number {
  const s = String(raw || '');
  const m = s.match(/(\d{1,2})[:.](\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const h = s.match(/^(\d{1,2})\s*$/);
  if (h) return Number(h[1]) * 60;
  return 24 * 60 + 59;
}

export interface HomeFeedRaw {
  newUpdate: Card[];
  completed: Card[];
  donghua: Card[];
  movie: Card[];
  sources: SourceResult[];
}

/**
 * ProviderAggregator — menjalankan penyedia resmi secara berurutan dan hanya
 * melanjutkan ke sumber cadangan bila sumber utama tidak punya data.
 * Nama penyedia TIDAK PERNAH keluar ke UI; hanya dipakai internal.
 */
export const ProviderAggregator = {
  /**
   * Pencarian berjenjang: Otakudesu → Samehadaku → Animeku. Sumber berikutnya
   * hanya dipanggil ketika sumber sebelumnya gagal atau tidak menemukan judul
   * yang relevan. Nekopoi (bila diaktifkan) berjalan sebagai jalur terpisah.
   */
  async search(query: string, opts: { timeout?: number; deadline?: number; max?: number; providerIds?: string[]; includeAdult?: boolean; signal?: AbortSignal; onUpdate?: (sources: SourceResult[]) => void } = {}): Promise<SourceResult[]> {
    const q = String(query || '').trim();
    if (!q) return [];
    const timeout = opts.timeout || 12000;
    const deadline = opts.deadline ?? 8500;
    const started = Date.now();
    const available = searchProviders().filter(p => isProviderSearchAllowed(p, opts.providerIds, opts.includeAdult));
    const explicit = !!opts.providerIds?.length;
    const normalChain = available.filter(p => p.content !== 'hentai');
    const adultChain = available.filter(p => p.content === 'hentai');
    const chain = explicit ? available : normalChain;
    const results: SourceResult[] = [];

    const searchOne = async (p: AnimeProvider): Promise<SourceResult> => {
      const t0 = performance.now();
      try {
        const allowAdult = !!opts.includeAdult && p.content === 'hentai';
        const visible = (cards: Card[]) => {
          const normalized = cards.map(card => ({ ...card, provider: card.provider || p.id }));
          return allowAdult ? normalized : filterDiscovery(normalized, p.id);
        };
        const fetched = await withTimeout(CacheManager.search(p.id, q, async () => visible(await p.search(q))), timeout);
        // Re-filter cache hits too; persisted search results predate current policy.
        const items = visible(fetched).map(card => ({ ...card, match: matchScore(q, card.title) }));
        markHealth(p.id, true);
        recordMetric({ provider: p.id, operation: 'search', ms: Math.round(performance.now() - t0), ok: true, count: items.length });
        return { id: p.id, ok: true, count: items.length, items };
      } catch (reason) {
        markHealth(p.id, false, String((reason as Error)?.message || reason || 'error'));
        recordMetric({ provider: p.id, operation: 'search', ms: Math.round(performance.now() - t0), ok: false, count: 0 });
        return { id: p.id, ok: false, count: 0, items: [], error: String((reason as Error)?.message || reason || 'error') };
      }
    };

    const publish = () => {
      if (opts.signal?.aborted || !opts.onUpdate) return;
      try { opts.onUpdate(results.slice()); } catch { /* UI observers cannot fail provider work. */ }
    };

    const remaining = () => deadline - (Date.now() - started);

    // Jalur normal: berhenti pada sumber pertama yang punya hasil relevan.
    for (const p of chain.slice(0, opts.max || 99)) {
      if (opts.signal?.aborted || remaining() <= 0) break;
      const result = await searchOne(p);
      results.push(result);
      publish();
      if (result.ok && result.items.some(card => matchScore(q, card.title) >= 40)) break;
    }

    // Jalur dewasa terpisah: hanya saat pengguna memilih opt-in.
    if (!explicit && opts.includeAdult && !opts.signal?.aborted) {
      for (const p of adultChain) {
        if (remaining() <= 0) break;
        const result = await searchOne(p);
        results.push(result);
        publish();
      }
    }

    return results;
  },

  /**
   * Beranda mentah dengan fallback per rail:
   * update baru / selesai / movie. Otakudesu diambil lebih dulu; sumber
   * berikutnya hanya dipanggil untuk rail yang masih kosong.
   */
  async homeFeed(opts: {
    timeout?: number;
    deadline?: number;
    onUpdate?: (feed: HomeFeedRaw) => void;
  } = {}): Promise<HomeFeedRaw> {
    const timeout = opts.timeout || 15000;
    const deadline = opts.deadline ?? 10000;
    const startedAt = Date.now();
    const providers = officialProviders();

    const feed: HomeFeedRaw = { newUpdate: [], completed: [], donghua: [], movie: [], sources: [] };
    const filled = () => feed.newUpdate.length > 0 && feed.completed.length > 0 && feed.movie.length > 0;

    for (const p of providers) {
      if (filled()) break;
      const remaining = deadline - (Date.now() - startedAt);
      if (remaining <= 0) break;
      const started = performance.now();
      try {
        const data = await withTimeout(CacheManager.home(p.id, () => p.home()), Math.min(timeout, remaining));
        const ongoing = filterDiscovery((data.ongoing || []).map(c => ({ ...c, provider: c.provider || p.id })), p.id).filter(c => !isMovieCard(c));
        const completed = filterDiscovery((data.completed || []).map(c => ({ ...c, provider: c.provider || p.id })), p.id).filter(c => !isMovieCard(c));
        const movie = filterDiscovery(
          [...(data.movie || []), ...(data.ongoing || []), ...(data.completed || [])]
            .map(c => ({ ...c, provider: c.provider || p.id }))
            .filter(isMovieCard),
          p.id
        );
        let contributed = (feed.newUpdate.length ? 0 : ongoing.length) +
          (feed.completed.length ? 0 : completed.length) +
          (feed.movie.length ? 0 : movie.length);
        if (!feed.newUpdate.length) feed.newUpdate.push(...ongoing);
        if (!feed.completed.length) feed.completed.push(...completed);
        if (!feed.movie.length) feed.movie.push(...movie);

        const rails: { key: 'newUpdate' | 'completed' | 'movie'; method: 'ongoing' | 'completed' | 'movies' }[] = [
          { key: 'newUpdate', method: 'ongoing' },
          { key: 'completed', method: 'completed' },
          { key: 'movie', method: 'movies' }
        ];
        for (const rail of rails) {
          if (feed[rail.key].length) continue;
          const fetchList = p[rail.method] as ((page?: number) => Promise<ListResult>) | undefined;
          if (!fetchList) continue;
          try {
            const remaining = deadline - (Date.now() - startedAt);
            if (remaining <= 0) break;
            const result = await withTimeout(fetchList.call(p, 1), Math.min(timeout, remaining));
            const cards = filterDiscovery((result.list || []).map(c => ({ ...c, provider: c.provider || p.id })), p.id);
            const picked = rail.key === 'movie' ? cards.filter(isMovieCard) : cards.filter(card => !isMovieCard(card));
            if (!picked.length) continue;
            feed[rail.key].push(...picked);
            contributed += picked.length;
          } catch {
            /* daftar khusus tidak tersedia; rail tetap kosong */
          }
        }
        markHealth(p.id, true);
        feed.sources.push({ id: p.id, ok: true, count: contributed, items: [] });
        recordMetric({
          provider: p.id,
          operation: 'home',
          ms: Math.round(performance.now() - started),
          ok: true,
          count: (data.ongoing?.length || 0) + (data.completed?.length || 0) + (data.movie?.length || 0)
        });
        if (contributed > 0) opts.onUpdate?.({ ...feed, sources: feed.sources.slice() });
      } catch (e) {
        markHealth(p.id, false, String((e as Error)?.message || e));
        feed.sources.push({ id: p.id, ok: false, count: 0, items: [], error: String((e as Error)?.message || e) });
        recordMetric({ provider: p.id, operation: 'home', ms: Math.round(performance.now() - started), ok: false, count: 0 });
      }
    }

    return feed;
  },

  /**
   * Jadwal rilis gabungan seluruh penyedia yang mendukung.
   * Setiap hari diurutkan dari jam terkecil ke terbesar.
   */
  async schedule(opts: { timeout?: number } = {}): Promise<{ groups: ScheduleGroup[]; ok: number }> {
    const timeout = opts.timeout || 15000;
    const providers = allProviders().filter(p => p.active && p.content !== 'hentai' && typeof p.schedule === 'function');
    const settled = await Promise.allSettled(
      providers.map(p =>
        withTimeout(
          CacheManager.get('sched', p.id, TTL.schedule, () => p.schedule!()),
          timeout
        ).then(days => ({ p, days }))
      )
    );

    const buckets: Record<number, ScheduleItem[]> = {};
    let ok = 0;
    settled.forEach((r, i) => {
      const p = providers[i];
      if (r.status !== 'fulfilled') return;
      ok++;
      for (const g of r.value.days || []) {
        const idx = dayIndex(g.day);
        if (idx < 0) continue;
        for (const item of filterDiscovery(g.items || [], p.id)) {
          (buckets[idx] = buckets[idx] || []).push({ ...item, provider: item.provider || p.id });
        }
      }
    });

    for (const idx of Object.keys(buckets)) {
      buckets[Number(idx)].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }

    const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const groups: ScheduleGroup[] = [];
    for (let i = 0; i < 7; i++) {
      if (buckets[i] && buckets[i].length) groups.push({ day: names[i], items: buckets[i] });
    }
    return { groups, ok };
  },

  /** Alias kompatibilitas: beranda gabungan berbentuk lama. */
  async home(opts: { timeout?: number } = {}): Promise<{
    ongoing: Card[];
    completed: Card[];
    movie: Card[];
    sources: SourceResult[];
  }> {
    const r = await this.homeFeed(opts);
    return {
      ongoing: dedupe(r.newUpdate),
      completed: dedupe(r.completed),
      movie: dedupe(r.movie),
      sources: r.sources
    };
  },

  /** Health check ringan: cukup panggil home() penyedia dan catat hasilnya. */
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
