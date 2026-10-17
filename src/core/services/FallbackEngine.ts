import type { AnimeProvider } from '../../providers/types';
import { orderedProviders, downloadProviders, markHealth, getProvider } from '../../providers/registry';
import type { DownloadLink, EpisodeStream } from '../types';
import { CacheManager } from './CacheManager';
import { mergeDownloads } from './EpisodeMatcher';

export interface StreamAttempt {
  provider: string;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface StreamResolution {
  stream: EpisodeStream | null;
  provider: string | null;
  attempts: StreamAttempt[];
}

export interface StreamParams {
  animeId?: string;
  animeSlug?: string;
  episodeId: string;
  episodeSlug?: string;
  episode?: string;
}

/** Batas waktu satu percobaan stream (per spesifikasi: 8 detik). */
const STREAM_TIMEOUT = 8000;

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

/** Ukur satu percobaan resolve dan tangkap galatnya agar tidak menghentikan fallback. */
async function tryProvider(
  p: AnimeProvider,
  params: StreamParams,
  timeout = STREAM_TIMEOUT
): Promise<{ ok: boolean; stream?: EpisodeStream; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const stream = await withTimeout(
      CacheManager.stream(p.id, params.episodeId, () => p.stream(params)),
      timeout
    );
    const ok = !!(stream && (stream.playerUrl || (stream.servers && stream.servers.length)));
    if (!ok) {
      markHealth(p.id, false, 'tidak ada sumber pemutaran');
      return { ok: false, error: 'Tidak ada sumber pemutaran', ms: Date.now() - t0 };
    }
    markHealth(p.id, true);
    return { ok: true, stream, ms: Date.now() - t0 };
  } catch (e: any) {
    const msg = String(e?.message || e || 'gagal');
    markHealth(p.id, false, msg);
    return { ok: false, error: msg, ms: Date.now() - t0 };
  }
}

/** Satu permintaan stream lengkap untuk satu penyedia. */
export interface StreamRequest {
  provider: string;
  params: StreamParams;
}

export interface ResolvedStream {
  provider: string;
  stream: EpisodeStream;
  ms: number;
}

/**
 * FallbackEngine — mesin pemutaran yang bekerja DIAM-DIAM:
 * mencoba seluruh penyedia (paralel untuk kecepatan, urut prioritas untuk
 * penentuan default) sampai menemukan sumber yang berhasil. Kegagalan satu
 * penyedia tidak pernah terlihat oleh pengguna.
 */
export const FallbackEngine = {
  /** Resolusi berurutan (kompatibilitas): coba penyedia sesuai prioritas sampai berhasil. */
  async resolveStream(preferred: string, params: StreamParams, opts: { skip?: string } = {}): Promise<StreamResolution> {
    const attempts: StreamAttempt[] = [];
    const providers = orderedProviders(preferred);

    for (const p of providers) {
      if (opts.skip && opts.skip === p.id) continue;
      const r = await tryProvider(p, params);
      attempts.push({ provider: p.id, ok: r.ok, error: r.error, ms: r.ms });
      if (r.ok && r.stream) {
        return { stream: r.stream, provider: p.id, attempts };
      }
    }
    return { stream: null, provider: null, attempts };
  },

  /**
   * Resolusi paralel lintas sumber: kirim semua permintaan sekaligus,
   * kumpulkan yang berhasil, urutkan sesuai prioritas permintaan.
   * Inilah jalur utama halaman pemutar (cepat + tetap ada cadangan).
   */
  async resolveAll(
    requests: StreamRequest[],
    opts: { timeout?: number; max?: number } = {}
  ): Promise<{ results: ResolvedStream[]; attempts: StreamAttempt[] }> {
    const timeout = opts.timeout || STREAM_TIMEOUT;
    const list = requests.slice(0, opts.max || 12);
    const settled = await Promise.allSettled(
      list.map(async req => {
        const p = getProvider(req.provider);
        if (!p) return { req, r: { ok: false, error: 'tidak tersedia', ms: 0 } as const };
        const r = await tryProvider(p, req.params, timeout);
        return { req, r };
      })
    );

    const results: ResolvedStream[] = [];
    const attempts: StreamAttempt[] = [];
    settled.forEach(s => {
      if (s.status !== 'fulfilled') return;
      const { req, r } = s.value;
      attempts.push({ provider: req.provider, ok: r.ok, error: r.error, ms: r.ms });
      if (r.ok && r.stream) results.push({ provider: req.provider, stream: r.stream, ms: r.ms });
    });
    return { results, attempts };
  },

  /**
   * Kumpulkan tautan unduh dari semua penyedia yang mendukung, digabung & diduplikasi.
   * Penyedia streaming juga disertakan karena sebagian menyediakan batch.
   */
  async collectDownloads(
    preferred: string,
    params: StreamParams
  ): Promise<{ links: DownloadLink[]; byProvider: { provider: string; links: DownloadLink[]; error?: string }[] }> {
    const byProvider: { provider: string; links: DownloadLink[]; error?: string }[] = [];
    const providers = downloadProviders();
    const preferredFirst = providers
      .slice()
      .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.priority - b.priority));

    await Promise.all(
      preferredFirst.map(async p => {
        if (typeof p.downloads !== 'function') return;
        try {
          const links = await CacheManager.downloads(
            p.id,
            params.episodeId || params.animeId || '',
            () => p.downloads!(params)
          );
          if (links && links.length) byProvider.push({ provider: p.id, links });
        } catch (e: any) {
          byProvider.push({ provider: p.id, links: [], error: String(e?.message || e) });
        }
      })
    );

    return { links: mergeDownloads(byProvider.map(b => b.links)), byProvider };
  },

  /** Catatan fallback netral untuk UI — tanpa menyebut nama sumber apa pun. */
  summary(provider: string | null, attempts: StreamAttempt[]): string {
    if (!provider) return '';
    const idx = attempts.findIndex(a => a.provider === provider);
    if (idx <= 0) return '';
    return 'Sumber utama sedang sibuk — otomatis dialihkan ke sumber cadangan.';
  }
};
