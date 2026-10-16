import type { AnimeProvider } from '../../providers/types';
import { orderedProviders, downloadProviders, markHealth } from '../../providers/registry';
import type { DownloadLink, EpisodeStream } from '../types';
import { cached } from '../client';
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

/** Ukur satu percobaan resolve dan tangkap galatnya agar tidak menghentikan fallback. */
async function tryProvider(p: AnimeProvider, params: StreamParams): Promise<{ ok: boolean; stream?: EpisodeStream; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const stream = await cached('episode:' + p.id + ':' + params.episodeId, 60 * 60 * 1000, () => p.stream(params));
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

/**
 * FallbackEngine — mencoba provider satu per satu (sesuai prioritas) sampai
 * menemukan sumber pemutaran yang berhasil. Preferensi pengguna dicoba lebih dulu.
 */
export const FallbackEngine = {
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
   * Kumpulkan tautan unduh dari semua provider yang mendukung, digabung & diduplikasi.
   * Provider streaming juga disertakan karena sebagian menyediakan batch.
   */
  async collectDownloads(preferred: string, params: StreamParams): Promise<{ links: DownloadLink[]; byProvider: { provider: string; links: DownloadLink[]; error?: string }[] }> {
    const byProvider: { provider: string; links: DownloadLink[]; error?: string }[] = [];
    const providers = downloadProviders();
    const preferredFirst = providers
      .slice()
      .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.priority - b.priority));

    await Promise.all(
      preferredFirst.map(async p => {
        if (typeof p.downloads !== 'function') return;
        try {
          const links = await cached(
            'downloads:' + p.id + ':' + (params.episodeId || params.animeId || ''),
            30 * 60 * 1000,
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

  /** Nama provider yang berhasil, untuk dikirim ke UI sebagai catatan fallback. */
  summary(provider: string | null, attempts: StreamAttempt[]): string {
    if (!provider) return 'Semua sumber gagal memutar episode ini.';
    const idx = attempts.findIndex(a => a.provider === provider);
    if (idx <= 0) return '';
    const skipped = attempts.slice(0, idx).map(a => a.provider).join(', ');
    return 'Beralih dari ' + skipped + ' ke ' + provider + '.';
  }
};
