import { TTL } from './config';
import { ApiError, apiGet, cached, saveSnapshot, loadSnapshot } from './client';
import { Store } from './store';
import { normalizeKusonimeCard } from './normalize';
import { cleanVal, seriesSlug } from './utils';
import { getProvider, markHealth, searchProviders, pickHealthy, downloadProviders, orderedProviders } from '../providers/registry';
import { otakudesuBatchDownloads, otakudesuGenre, legacyResolveServer } from '../providers/legacy';
import { SearchEngine, applyFilters, type SearchFilters, type SearchSort } from './services/SearchEngine';
import { FallbackEngine, type StreamAttempt } from './services/FallbackEngine';
import { DownloadAggregator } from './services/DownloadAggregator';
import { ProviderAggregator } from './services/ProviderAggregator';
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
          saveSnapshot('home', r);
          return r;
        }
        failures.push(p.id + ': halaman tidak berisi daftar anime');
        markHealth(p.id, false, 'halaman tidak berisi daftar anime');
      } catch (e: any) {
        failures.push(p.id + ': ' + (e?.message || 'gagal'));
        markHealth(p.id, false, e?.message || 'gagal');
      }
    }
    const snap = loadSnapshot<{ ongoing: Card[]; completed: Card[]; movie: Card[] }>('home');
    if (snap) {
      console.warn('Beranda memakai snapshot terakhir:', failures.join(' · '));
      return snap;
    }
    console.warn('Beranda gagal dari semua sumber:', failures.join(' · '));
    throw new ApiError('Gagal memuat beranda. Periksa koneksi lalu coba lagi.');
  },
  async search(query: string): Promise<SearchResult> {
    if (!query || query.trim().length < 2) return { items: [], sources: [] };
    const preferred = Store.getProvider();
    /* SearchEngine menjalankan semua provider paralel, memberi skor relevansi,
       membuang duplikat lintas provider, dan mengurutkan berdasarkan kecocokan. */
    const r = await SearchEngine.search(query, { sort: 'relevance' });
    if (!r.sources.length || r.sources.every(s => !s.ok)) {
      throw new Error(r.sources.map(s => s.error).filter(Boolean)[0] || 'Pencarian gagal.');
    }
    /* Provider terpilih dinaikkan bila skornya seri, agar preferensi pengguna dihormati. */
    const items = r.items.slice().sort((a, b) => {
      const d = (b.match || 0) - (a.match || 0);
      if (d !== 0) return d;
      return (a.provider === preferred ? -1 : b.provider === preferred ? 1 : 0);
    });
    return { items, sources: r.sources };
  },

  /** Pencarian lanjutan dengan saringan & saran judul (dipakai halaman Jelajah). */
  async searchAdvanced(
    query: string,
    opts: { filters?: SearchFilters; sort?: SearchSort } = {}
  ): Promise<SearchResult> {
    if (!query || query.trim().length < 2) return { items: [], sources: [] };
    const r = await SearchEngine.search(query, opts);
    return { items: applyFilters(r.items, opts.filters || {}), sources: r.sources };
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
    if (!p) throw new ApiError('Sumber tidak tersedia saat ini.', 404);
    try {
      const d = await cached('detail:' + provider + ':' + id, TTL.detail, () => p.detail(id, slug));
      markHealth(provider, true);
      return d;
    } catch (e: any) {
      markHealth(provider, false, e?.message);
      throw wrapErr(e);
    }
  },

  /**
   * Detail dengan penyelesaian lintas sumber: bila detail pada sumber yang diminta
   * gagal (mis. ID/slug berbeda antar sumber), cari judul lalu pakai detail paling cocok.
   * Menghindari "judul tidak ditemukan" palsu akibat ketidakcocokan ID antar sumber.
   */
  async detailSmart(provider: string, id: string, slug = '', title = ''): Promise<Detail> {
    try {
      return await this.detail(provider, id, slug);
    } catch (e: any) {
      const q = String(title || '').trim();
      if (q.length < 2) throw e;
      try {
        const r = await SearchEngine.search(q, { sort: 'relevance' });
        const best = r.items.slice().sort((a, b) => (b.match || 0) - (a.match || 0))[0];
        if (!best) throw e;
        if (best.provider === provider && best.id === id) throw e;
        return await this.detail(best.provider, best.id, best.slug || '');
      } catch {
        throw e;
      }
    }
  },

  async episode(
    provider: string,
    params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }
  ): Promise<Stream & { downloads: DownloadLink[]; info: any }> {
    const p = getProvider(provider);
    if (!p) throw new ApiError('Sumber tidak tersedia saat ini.', 404);
    try {
      const s = await cached('episode:' + provider + ':' + params.episodeId, TTL.episode, () => p.stream(params));
      markHealth(provider, true);
      return s;
    } catch (e: any) {
      markHealth(provider, false, e?.message);
      throw wrapErr(e);
    }
  },

  /**
   * Putar episode dengan fallback lintas provider: coba provider terpilih dulu,
   * lalu provider lain sesuai prioritas sampai ada yang berhasil.
   */
  async streamWithFallback(
    provider: string,
    params: { episodeId: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }
  ): Promise<(Stream & { downloads: DownloadLink[]; info: any }) & { resolvedProvider: string; fallbackNote: string; attempts: StreamAttempt[] }> {
    const preferred = provider || Store.getProvider();
    const res = await FallbackEngine.resolveStream(preferred, params);
    if (!res.stream || !res.provider) {
      const detail = res.attempts
        .filter(a => a.error)
        .map(a => a.provider + ': ' + a.error)
        .join(' · ');
      console.warn('Putar gagal di semua sumber:', detail);
      throw new ApiError('Tidak ada sumber yang bisa memutar episode ini. Coba episode lain atau muat ulang.');
    }
    return {
      ...res.stream,
      resolvedProvider: res.provider,
      fallbackNote: FallbackEngine.summary(res.provider, res.attempts),
      attempts: res.attempts
    };
  },

  /** Gabungkan tautan unduh dari semua provider unduhan (tab Download detail & halaman episode). */
  async aggregateDownloads(
    provider: string,
    params: { title?: string; episodeId?: string; episodeSlug?: string; episode?: string; animeId?: string; animeSlug?: string }
  ): Promise<{ links: DownloadLink[]; byProvider: { provider: string; name: string; links: DownloadLink[]; error?: string }[] }> {
    return DownloadAggregator.collect({
      preferred: provider || Store.getProvider(),
      title: params.title,
      episode: params.episode,
      episodeId: params.episodeId,
      episodeSlug: params.episodeSlug,
      animeId: params.animeId,
      animeSlug: params.animeSlug
    });
  },

  /** Beranda gabungan dari seluruh provider (dipakai untuk rail "Dari sumber lain"). */
  async homeAggregate(): Promise<{ ongoing: Card[]; completed: Card[]; movie: Card[]; sources: { id: string; ok: boolean; count: number }[] }> {
    const r = await ProviderAggregator.home();
    return {
      ongoing: r.ongoing,
      completed: r.completed,
      movie: r.movie,
      sources: r.sources.map(s => ({ id: s.id, ok: s.ok, count: s.count }))
    };
  },

  /** Sumber yang menyediakan tautan unduh (untuk tab Download & pengaturan provider). */
  downloadSources(): { id: string; name: string; downloadOnly: boolean }[] {
    return downloadProviders().map(p => ({ id: p.id, name: p.name, downloadOnly: !!p.downloadOnly }));
  },

  /** Semua provider aktif (untuk pemilih sumber di Pengaturan/Profil). */
  streamingSources(): { id: string; name: string }[] {
    return orderedProviders(Store.getProvider()).map(p => ({ id: p.id, name: p.name }));
  },

  /** Resolve server alternatif → URL embed; provider opsional agar hash baru (Anichin) terketahui asalnya. */
  async resolveServer(serverId: string, provider?: string): Promise<string> {
    if (/^https?:\/\//i.test(serverId)) return serverId;
    if (serverId.startsWith('oplz:')) return legacyResolveServer(serverId);
    const p = provider ? getProvider(provider) : null;
    if (p && p.resolveServer) return p.resolveServer(serverId);
    if (!provider || provider === 'otakudesu' || provider === 'oploverz') return legacyResolveServer(serverId);
    throw new ApiError('Server alternatif ini tidak didukung untuk judul ini.');
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
    if (!out.length) {
      const snap = loadSnapshot<ScheduleGroup[]>('schedule');
      if (snap && snap.length) return snap;
      throw new ApiError('Jadwal rilis tidak tersedia saat ini.', 404);
    }
    saveSnapshot('schedule', out);
    return out;
  }
};

/* Re-export util lama yang dipakai view. */
export { cleanVal, seriesSlug };
