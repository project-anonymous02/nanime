import { TTL } from './config';
import { ApiError, apiGet, cached } from './client';
import { Store } from './store';
import { normalizeKusonimeCard } from './normalize';
import { cleanVal, seriesSlug } from './utils';
import { getProvider, markHealth, searchProviders, pickHealthy } from '../providers/registry';
import { otakudesuBatchDownloads, otakudesuGenre, legacyResolveServer } from '../providers/legacy';
import type { ScrapeTask } from './scraper';
import type {
  Card,
  Detail,
  DownloadLink,
  ListResult,
  ScheduleGroup,
  ScheduleItem,
  SearchResult,
  Stream
} from './types';

export type { ScheduleGroup } from './types';

const task = (provider: string, action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
  provider: provider as ScrapeTask['provider'],
  action,
  ...extra
});

const DAY_KEYS = [
  ['minggu', 'sunday', 'sun'],
  ['senin', 'monday', 'mon'],
  ['selasa', 'tuesday', 'tue'],
  ['rabu', 'wednesday', 'wed'],
  ['kamis', 'thursday', 'thu'],
  ['jumat', 'jum', 'friday', 'fri'],
  ['sabtu', 'saturday', 'sat']
];

export function dayIndex(raw: string): number {
  const s = String(raw || '').toLowerCase();
  for (let i = 0; i < DAY_KEYS.length; i++) {
    if (DAY_KEYS[i].some(k => s.indexOf(k) > -1)) return i;
  }
  return -1;
}

/** Samakan galat provider menjadi ApiError yang dipahami view (pertahankan code/status). */
function wrapErr(e: any): any {
  if (e instanceof ApiError) return e;
  const status = e?.code === 'notfound' ? 404 : e?.status;
  const err = new ApiError(e?.message || 'Gagal mengambil data provider.', status);
  if (e?.code) (err as any).code = e.code;
  return err;
}

export const API = {
  async home(): Promise<{ ongoing: Card[]; completed: Card[]; movie: Card[] }> {
    const preferred = Store.getProvider();
    const failures: string[] = [];
    for (const p of pickHealthy(preferred)) {
      try {
        const r = await cached('home:' + p.id, TTL.home, () => p.home());
        if (r.ongoing.length || r.completed.length || r.movie.length) {
          markHealth(p.id, true);
          return r;
        }
        failures.push(p.id + ': halaman tidak berisi daftar anime');
        markHealth(p.id, false, 'halaman tidak berisi daftar anime');
      } catch (e: any) {
        failures.push(p.id + ': ' + (e?.message || 'gagal'));
        markHealth(p.id, false, e?.message || 'gagal');
      }
    }
    throw new ApiError('Semua sumber gagal dimuat. ' + failures.join(' · '));
  },

  async search(query: string): Promise<SearchResult> {
    if (!query || query.trim().length < 2) return { items: [], sources: [] };
    const preferred = Store.getProvider();
    const providers = searchProviders(preferred);

    const sources = await Promise.all(
      providers.map(async p => {
        try {
          const list = await cached('search:' + p.id + ':' + query, TTL.search, () => p.search(query));
          markHealth(p.id, true);
          return { id: p.id, ok: true, count: list.length, items: list };
        } catch (e: any) {
          if (e?.status === 404 || e?.code === 'notfound') return { id: p.id, ok: true, count: 0, items: [] };
          console.warn('Search failed:', p.id, e);
          markHealth(p.id, false, e?.message);
          return { id: p.id, ok: false, count: 0, items: [], error: e?.message || 'Gagal' };
        }
      })
    );

    if (!sources.length || sources.every(s => !s.ok)) {
      throw new Error(sources.map(s => s.error).filter(Boolean)[0] || 'Pencarian gagal.');
    }

    const items: Card[] = [];
    const seen = new Set<string>();
    sources.forEach(s =>
      s.items.forEach(a => {
        const key = a.provider + ':' + a.id;
        if (seen.has(key)) return;
        seen.add(key);
        items.push(a);
      })
    );
    return { items, sources: sources.map(s => ({ id: s.id, ok: s.ok, count: s.count, items: s.items, error: s.error })) };
  },

  async movies(): Promise<{ items: Card[]; error: string }> {
    try {
      const page = (n: number) =>
        apiGet(task('kusonime', 'movies', { page: n }), 20000, 'movie:season:' + n, TTL.home);
      const results = await Promise.all(
        [1, 2].map(n => page(n).catch(e => { console.warn('Movie page failed:', n, e); return null; }))
      );
      const items: Card[] = [];
      const seen = new Set<string>();
      let okCount = 0;
      results.forEach(r => {
        if (!r || !Array.isArray(r.data)) return;
        okCount++;
        r.data.forEach((i: any) => {
          const c = normalizeKusonimeCard(i, 'Movie');
          if (!c || seen.has(c.id)) return;
          seen.add(c.id);
          items.push(c);
        });
      });
      if (!okCount) return { items: [], error: 'Sumber movie tidak merespons.' };
      return { items, error: '' };
    } catch (e: any) {
      console.warn('Movie list failed:', e);
      return { items: [], error: e?.message || 'Gagal' };
    }
  },

  async detail(provider: string, id: string, slug = ''): Promise<Detail> {
    const p = getProvider(provider);
    if (!p) throw new ApiError('Provider tidak tersedia.');
    try {
      const d = await cached('detail:' + provider + ':' + id, TTL.detail, () => p.detail(id, slug));
      markHealth(provider, true);
      return d;
    } catch (e: any) {
      markHealth(provider, false, e?.message);
      throw wrapErr(e);
    }
  },

  async episode(
    provider: string,
    params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }
  ): Promise<Stream & { downloads: DownloadLink[]; info: any }> {
    const p = getProvider(provider);
    if (!p) throw new ApiError('Provider tidak tersedia.');
    try {
      const s = await cached('episode:' + provider + ':' + params.episodeId, TTL.episode, () => p.stream(params));
      markHealth(provider, true);
      return s;
    } catch (e: any) {
      markHealth(provider, false, e?.message);
      throw wrapErr(e);
    }
  },

  /** Resolve server alternatif → URL embed; provider opsional agar hash baru (Anichin) terketahui asalnya. */
  async resolveServer(serverId: string, provider?: string): Promise<string> {
    if (/^https?:\/\//i.test(serverId)) return serverId;
    if (serverId.startsWith('oplz:')) return legacyResolveServer(serverId);
    const p = provider ? getProvider(provider) : null;
    if (p && p.resolveServer) return p.resolveServer(serverId);
    if (!provider || provider === 'otakudesu' || provider === 'oploverz') return legacyResolveServer(serverId);
    throw new ApiError('Provider tidak mendukung pemilihan server.');
  },

  async batchDownloads(batchId: string): Promise<DownloadLink[]> {
    return otakudesuBatchDownloads(batchId);
  },

  async genres(): Promise<{ genreId: string; title: string }[]> {
    const p = getProvider('otakudesu');
    if (!p || !p.genres) return [];
    try {
      return await p.genres();
    } catch {
      return [];
    }
  },

  async ongoing(page = 1): Promise<ListResult> {
    const provider = Store.getProvider();
    const p = getProvider(provider);
    if (!p || !p.ongoing) return { list: [], pagination: null };
    try {
      const r = await cached('ongoing:' + provider + ':' + page, TTL.home, () => p.ongoing!(page));
      return r;
    } catch (e) {
      console.warn('ongoing failed', e);
      return { list: [], pagination: null };
    }
  },

  async completed(page = 1): Promise<ListResult> {
    const provider = Store.getProvider();
    const p = getProvider(provider);
    if (!p || !p.completed) return { list: [], pagination: null };
    try {
      return await cached('completed:' + provider + ':' + page, TTL.home, () => p.completed!(page));
    } catch (e) {
      console.warn('completed failed', e);
      return { list: [], pagination: null };
    }
  },

  async genre(genreId: string, page = 1): Promise<ListResult> {
    try {
      return await cached('genre:' + genreId + ':' + page, TTL.genre, () => otakudesuGenre(genreId, page));
    } catch (e: any) {
      throw wrapErr(e);
    }
  },

  /** Jadwal rilis gabungan dari seluruh provider yang mendukung. */
  async schedule(): Promise<ScheduleGroup[]> {
    const groups: Record<number, ScheduleItem[]> = {};
    const push = (idx: number, item: ScheduleItem) => {
      if (idx < 0) return;
      (groups[idx] = groups[idx] || []).push(item);
    };

    const jobs: Promise<void>[] = [];
    for (const p of [getProvider('otakudesu'), getProvider('oploverz')]) {
      if (!p || !p.schedule) continue;
      jobs.push(
        cached('sched:' + p.id, TTL.schedule, () => p.schedule!())
          .then(days =>
            days.forEach(d => d.items.forEach(item => push(dayIndex(d.day), item)))
          )
          .catch((e: any) => console.warn('schedule ' + p.id, e))
      );
    }

    await Promise.all(jobs);

    const order = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const out: ScheduleGroup[] = [];
    for (let i = 0; i < 7; i++) {
      if (groups[i] && groups[i].length) out.push({ day: order[i], items: groups[i] });
    }
    if (!out.length) throw new ApiError('Jadwal tidak tersedia untuk provider ini.', 404);
    return out;
  }
};

/* Re-export util lama yang dipakai view. */
export { cleanVal, seriesSlug };
