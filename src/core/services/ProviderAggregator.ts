import type { AnimeProvider } from '../../providers/types';
import { searchProviders, allProviders } from '../../providers/registry';
import { markHealth } from '../../providers/registry';
import type { Card, ScheduleGroup, ScheduleItem, SourceResult } from '../types';
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

/** Jalankan tugas dengan batas konkurensi (urutan masuk dipertahankan). */
async function runPool<T>(items: T[], limit: number, job: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await job(item);
    }
  });
  await Promise.all(workers);
}

/**
 * ProviderAggregator — menjalankan semua penyedia secara paralel
 * (Promise.allSettled) dan melaporkan status per sumber.
 * Nama penyedia TIDAK PERNAH keluar ke UI; hanya dipakai internal.
 */
export const ProviderAggregator = {
  /** Pencarian paralel dari semua penyedia yang mendukung pencarian. */
  async search(query: string, opts: { timeout?: number; deadline?: number; max?: number; providerIds?: string[]; includeAdult?: boolean; signal?: AbortSignal; onUpdate?: (sources: SourceResult[]) => void } = {}): Promise<SourceResult[]> {
    const q = String(query || '').trim();
    if (!q) return [];
    const timeout = opts.timeout || 12000;
    const deadline = opts.deadline ?? 8500;
    const providers = searchProviders().filter(p => isProviderSearchAllowed(p, opts.providerIds, opts.includeAdult)).slice(0, opts.max || 99);

    const settled: PromiseSettledResult<{ p: AnimeProvider; items: Card[] }>[] = new Array(providers.length);
    let publishing = true;
    const sourceResult = (result: PromiseSettledResult<{ p: AnimeProvider; items: Card[] }>, index: number): SourceResult => {
      const p = providers[index];
      if (result.status === 'fulfilled') {
        const items = (result.value.items || []).map(card => ({ ...card, match: matchScore(q, card.title) }));
        return { id: p.id, ok: true, count: items.length, items };
      }
      return { id: p.id, ok: false, count: 0, items: [], error: String((result.reason && result.reason.message) || result.reason || 'error') };
    };
    const publishSnapshot = () => {
      if (!publishing || opts.signal?.aborted || !opts.onUpdate) return;
      try { opts.onUpdate(settled.flatMap((result, index) => result ? [sourceResult(result, index)] : [])); } catch { /* UI observers cannot fail provider work. */ }
    };
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        if (opts.signal?.aborted) return;
        const index = cursor++;
        if (index >= providers.length) return;
        const p = providers[index];
        try {
          const started = performance.now();
          const allowAdult = !!opts.includeAdult && p.content === 'hentai';
          const visible = (cards: Card[]) => {
            const normalized = cards.map(card => ({ ...card, provider: card.provider || p.id }));
            return allowAdult ? normalized : filterDiscovery(normalized, p.id);
          };
          const fetched = await withTimeout(CacheManager.search(p.id, q, async () => visible(await p.search(q))), timeout);
          // Re-filter cache hits too; persisted search results predate current policy.
          const items = visible(fetched);
          settled[index] = { status: 'fulfilled', value: { p, items } };
          recordMetric({ provider: p.id, operation: 'search', ms: Math.round(performance.now() - started), ok: true, count: items.length });
        } catch (reason) {
          settled[index] = { status: 'rejected', reason };
          recordMetric({ provider: p.id, operation: 'search', ms: timeout, ok: false, count: 0 });
        }
        publishSnapshot();
      }
    };
    const workers = Promise.all(Array.from({ length: Math.min(8, Math.max(1, providers.length)) }, worker));
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<void>(resolve => {
      if (opts.signal?.aborted) resolve();
      else if (opts.signal) {
        abortListener = () => resolve();
        opts.signal.addEventListener('abort', abortListener, { once: true });
      }
    });
    await Promise.race([workers, aborted, new Promise<void>(resolve => { deadlineTimer = setTimeout(resolve, deadline); })]);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (abortListener) opts.signal?.removeEventListener('abort', abortListener);
    publishing = false;
    // A canceled query is not a provider failure and must not poison health
    // state based on requests that the caller no longer needs.
    if (opts.signal?.aborted) return [];
    const snapshot = settled.map((result, index) => result || ({ status: 'rejected', reason: new Error('deadline') } as const));

    return snapshot.map((r, i) => {
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

  /**
   * Beranda mentah dari seluruh penyedia, dipisah per rail:
   * update baru / selesai / donghua / movie. Penggabungan kanonik
   * (satu judul = satu kartu) dilakukan oleh lapisan katalog.
   *
   * Cepat: maksimal 8 scraping serentak dan ada
   * `deadline` — begitu waktunya habis, hasil yang sudah masuk langsung
   * dipakai; penyedia yang belum selesai tetap berjalan di latar dan
   * mengisi cache per-penyedia untuk panggilan berikutnya.
   */
  async homeFeed(opts: {
    timeout?: number;
    deadline?: number;
    concurrency?: number;
    onUpdate?: (feed: HomeFeedRaw) => void;
  } = {}): Promise<HomeFeedRaw> {
    const timeout = opts.timeout || 15000;
    const deadline = opts.deadline ?? 10000;
    const concurrency = opts.concurrency ?? 8;
    const providers = allProviders()
      // Catalog providers can contribute discovery cards independently of
      // whether their media capability is streaming or download-only.
      .filter(p => p.active && p.content !== 'hentai')
      .sort((a, b) => a.priority - b.priority);

    const results: Array<{ p: AnimeProvider; ok: boolean; data?: Awaited<ReturnType<AnimeProvider['home']>>; error?: string }> =
      new Array(providers.length);

    const snapshot = (): HomeFeedRaw => {
      const newUpdate: Card[] = [];
      const completed: Card[] = [];
      const donghua: Card[] = [];
      const movie: Card[] = [];
      const sources: SourceResult[] = [];
      results.forEach(r => {
        if (!r) return;
        const p = r.p;
        if (r.ok && r.data) {
          const d = r.data;
          const items = filterDiscovery((d.ongoing || []).concat(d.completed || []).concat(d.movie || []).map(c => ({
            ...c,
            provider: c.provider || p.id
          })), p.id);
          const safeMovies = filterDiscovery(d.movie || [], p.id);
          const movieItems = safeMovies.concat(items.filter(isMovieCard));
          if (p.movieOnly) movie.push(...movieItems);
          else if (p.content === 'donghua') donghua.push(...items);
          else {
            newUpdate.push(...filterDiscovery(d.ongoing || [], p.id).filter(c => !isMovieCard(c)));
            completed.push(...filterDiscovery(d.completed || [], p.id).filter(c => !isMovieCard(c)));
            movie.push(...movieItems);
          }
          markHealth(p.id, true);
          sources.push({ id: p.id, ok: true, count: (d.ongoing || []).length + (d.completed || []).length, items: [] });
        } else {
          markHealth(p.id, false, r.error || 'timeout');
          sources.push({ id: p.id, ok: false, count: 0, items: [], error: r.error || '' });
        }
      });
      return { newUpdate, completed, donghua, movie, sources };
    };

    // Maksimal `concurrency` scraping serentak — urutan prioritas dipertahankan.
    const running = runPool(providers, concurrency, async p => {
      const i = providers.indexOf(p);
      const started = performance.now();
      try {
        const data = await withTimeout(
          CacheManager.home(p.id, () => p.home()),
          timeout
        );
        results[i] = { p, ok: true, data };
        recordMetric({ provider: p.id, operation: 'home', ms: Math.round(performance.now() - started), ok: true, count: (data.ongoing?.length || 0) + (data.completed?.length || 0) + (data.movie?.length || 0) });
      } catch (e) {
        results[i] = { p, ok: false, error: String((e as Error)?.message || e) };
        recordMetric({ provider: p.id, operation: 'home', ms: timeout, ok: false, count: 0 });
      }
      const result = results[i];
      if (result?.ok && result.data &&
        ((result.data.ongoing?.length || 0) + (result.data.completed?.length || 0) + (result.data.movie?.length || 0) > 0)) {
        opts.onUpdate?.(snapshot());
      }
    });

    // Tunggu semua ATAU batas waktu habis — yang penting UI bisa lanjut.
    await Promise.race([running, new Promise(r => setTimeout(r, deadline))]);

    return snapshot();
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
