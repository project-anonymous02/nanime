import type { AnimeProvider } from '../../providers/types';
import { searchProviders, allProviders } from '../../providers/registry';
import { markHealth } from '../../providers/registry';
import type { Card, ScheduleGroup, ScheduleItem, SourceResult } from '../types';
import { CacheManager, TTL } from './CacheManager';
import { matchScore } from '../utils/fuzzyMatch';

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
  async search(query: string, opts: { timeout?: number; max?: number } = {}): Promise<SourceResult[]> {
    const q = String(query || '').trim();
    if (!q) return [];
    const timeout = opts.timeout || 12000;
    const providers = searchProviders().slice(0, opts.max || 99);

    const settled = await Promise.allSettled(
      providers.map(p =>
        withTimeout(
          CacheManager.search(p.id, q, () => p.search(q)),
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

  /**
   * Beranda mentah dari seluruh penyedia, dipisah per rail:
   * update baru / selesai / donghua / movie. Penggabungan kanonik
   * (satu judul = satu kartu) dilakukan oleh lapisan katalog.
   *
   * Cepat: maksimal 6 scraping serentak (radio HP lebih sehat) dan ada
   * `deadline` — begitu waktunya habis, hasil yang sudah masuk langsung
   * dipakai; penyedia yang belum selesai tetap berjalan di latar dan
   * mengisi cache per-penyedia untuk panggilan berikutnya.
   */
  async homeFeed(opts: { timeout?: number; deadline?: number; concurrency?: number } = {}): Promise<HomeFeedRaw> {
    const timeout = opts.timeout || 15000;
    const deadline = opts.deadline ?? 10000;
    const concurrency = opts.concurrency ?? 6;
    const providers = allProviders()
      .filter(p => p.active && !p.downloadOnly)
      .sort((a, b) => a.priority - b.priority);

    const results: Array<{ p: AnimeProvider; ok: boolean; data?: Awaited<ReturnType<AnimeProvider['home']>>; error?: string }> =
      new Array(providers.length);

    // Maksimal `concurrency` scraping serentak — urutan prioritas dipertahankan.
    const running = runPool(providers, concurrency, async p => {
      const i = providers.indexOf(p);
      try {
        const data = await withTimeout(
          CacheManager.home(p.id, () => p.home()),
          timeout
        );
        results[i] = { p, ok: true, data };
      } catch (e) {
        results[i] = { p, ok: false, error: String((e as Error)?.message || e) };
      }
    });

    // Tunggu semua ATAU batas waktu habis — yang penting UI bisa lanjut.
    await Promise.race([running, new Promise(r => setTimeout(r, deadline))]);

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
        const items = (d.ongoing || []).concat(d.completed || []).concat(d.movie || []).map(c => ({
          ...c,
          provider: c.provider || p.id
        }));
        if (p.movieOnly) {
          movie.push(...(d.movie || items));
        } else if (p.content === 'donghua') {
          donghua.push(...items);
        } else {
          newUpdate.push(...(d.ongoing || []));
          completed.push(...(d.completed || []));
          movie.push(...(d.movie || []));
        }
        markHealth(p.id, true);
        sources.push({
          id: p.id,
          ok: true,
          count: (d.ongoing || []).length + (d.completed || []).length,
          items: []
        });
      } else {
        markHealth(p.id, false, r.error || 'timeout');
        sources.push({
          id: p.id,
          ok: false,
          count: 0,
          items: [],
          error: r.error || ''
        });
      }
    });

    return { newUpdate, completed, donghua, movie, sources };
  },

  /**
   * Jadwal rilis gabungan seluruh penyedia yang mendukung.
   * Setiap hari diurutkan dari jam terkecil ke terbesar.
   */
  async schedule(opts: { timeout?: number } = {}): Promise<{ groups: ScheduleGroup[]; ok: number }> {
    const timeout = opts.timeout || 15000;
    const providers = allProviders().filter(p => p.active && typeof p.schedule === 'function');
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
        for (const item of g.items || []) {
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
