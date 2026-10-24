import type { AnimeProvider } from '../../providers/types';
import { markHealth, getProvider, streamingPriority } from '../../providers/registry';
import type { DownloadLink, EpisodeStream } from '../types';
import { httpGetText, httpProbe } from '../http';
import { isVideoUrl } from '../utils';
import { CacheManager } from './CacheManager';
import { mergeDownloads } from './EpisodeMatcher';
import { resolveMediaUrl } from './StreamExtractor';

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
  sourceKind?: 'direct-media' | 'embed-page' | 'provider-resolver';
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

async function verifyDirectMedia(url: string): Promise<boolean> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const path = parsed.pathname.toLowerCase();
  const isHls = path.endsWith('.m3u8');
  const isDash = path.endsWith('.mpd');
  const isKnownFile = isVideoUrl(parsed.href);
  if (!isHls && !isDash && !isKnownFile) return false;
  const probe = await httpProbe(parsed.href);
  if (probe.status < 200 || probe.status >= 300) return false;
  if (probe.contentType.startsWith('video/')) return true;
  if (isHls || isDash) {
    const expectedMime = isHls
      ? ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl']
      : ['application/dash+xml'];
    if (!expectedMime.includes(probe.contentType) && probe.contentType !== 'text/plain') return false;
    // Manifests are small text documents; verify their signature instead of
    // trusting a filename or content type alone.
    const response = await httpGetText(parsed.href, { timeout: 5000, retries: 0, corsOk: true });
    return isHls
      ? /^\s*#EXTM3U(?:\s|$)/.test(response.text)
      : /<MPD(?:\s|>)/i.test(response.text.slice(0, 4096));
  }
  return false;
}

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
    const result = await withTimeout((async () => {
      const stream = await CacheManager.stream(p.id, params.episodeId, () => p.stream(params));
      if (!stream) return null;

      const qualityByRef = new Map<string, string>();
      for (const group of stream.qualities || []) {
        for (const server of group.servers || []) {
          if (server.id && group.title) qualityByRef.set(server.id, group.title);
        }
      }
      const raw: { name: string; ref: string; quality?: string }[] = [];
      const seen = new Set<string>();
      const pushRef = (ref: string, name: string, quality?: string) => {
        if (!ref || seen.has(ref)) return;
        seen.add(ref);
        raw.push({ name, ref, quality: quality || qualityByRef.get(ref) || undefined });
      };
      (stream.servers || []).forEach(server => pushRef(server.id, server.name, server.quality));
      pushRef(stream.playerUrl, 'Utama');
      const distinctQualities: typeof raw = [];
      const extras: typeof raw = [];
      const seenQuality = new Set<string>();
      for (const item of raw) {
        const label = item.quality || '';
        if (label && !seenQuality.has(label)) {
          seenQuality.add(label);
          distinctQualities.push(item);
        } else {
          extras.push(item);
        }
      }
      const ranked = [...distinctQualities, ...extras];
      const httpCandidates = ranked.filter(candidate => /^https?:\/\//i.test(candidate.ref));
      const opaqueCandidates = ranked.filter(candidate => !/^https?:\/\//i.test(candidate.ref));
      const candidates = [...httpCandidates, ...opaqueCandidates].slice(0, 8);
      // The primary player URL is often the only immediately usable embed.
      // Never let a long mirror list truncate it out of the bounded candidates.
      if (stream.playerUrl && /^https?:\/\//i.test(stream.playerUrl) && !candidates.some(candidate => candidate.ref === stream.playerUrl)) {
        candidates[candidates.length < 8 ? candidates.length : 7] = {
          name: 'Utama', ref: stream.playerUrl, quality: undefined
        };
      }
      if (!candidates.length) return null;

      const media: typeof raw = [];
      const embeds: typeof raw = [];
      // Resolve explicit URLs first. If one is a usable embed, opaque server
      // IDs must not delay or suppress it; those IDs are only useful when the
      // provider supplied no playable URL at all.
      for (const batch of [httpCandidates, opaqueCandidates]) {
        for (const candidate of batch) {
          if (!candidates.includes(candidate)) continue;
          let url = candidate.ref;
          if (!/^https?:\/\//i.test(url)) {
            if (!p.resolveServer) continue;
            try { url = await p.resolveServer(url); } catch { continue; }
          }
          if (!url) continue;
          try {
            if (await verifyDirectMedia(url)) {
              media.push({ ...candidate, ref: url });
              continue;
            }
          } catch { /* try extraction or the next server */ }
          const sameEpisodePage = (() => {
            try {
              return /^https?:\/\//i.test(params.episodeId) && new URL(url).href === new URL(params.episodeId).href;
            } catch {
              return false;
            }
          })();
          if (sameEpisodePage) continue;
          let isEmbed = false;
          try {
            const probe = await httpProbe(url, 4000);
            if (probe.status >= 200 && probe.status < 300 && /^(?:text\/html|application\/xhtml\+xml)$/.test(probe.contentType)) {
              isEmbed = true;
            } else if ([403, 405, 501].includes(probe.status)) {
              // Embed hosts commonly deny HEAD while still allowing iframe GET.
              isEmbed = true;
            }
          } catch {
            // HEAD/CORS restrictions do not prove that a provider-parsed iframe is unusable.
            isEmbed = true;
          }
          if (isEmbed) {
            embeds.push({ ...candidate, ref: url });
            continue;
          }
          // Only crawl an endpoint when HEAD did not already prove it is an
          // iframe page. A slow embed GET must not consume the provider timeout
          // before we can return the playable iframe URL.
          if (!isVideoUrl(url)) {
            try {
              const resolved = await resolveMediaUrl(url);
              if (resolved.kind === 'file' && resolved.url && (await verifyDirectMedia(resolved.url))) {
                media.push({ ...candidate, ref: resolved.url });
              }
            } catch { /* embed tidak dapat diekstrak */ }
          }
        }
        if (media.length || embeds.length) break;
      }
      if (!media.length && !embeds.length) return null;
      const chosen = media.length ? media : embeds;
      return { stream, chosen, kind: media.length ? ('direct-media' as const) : ('embed-page' as const) };
    })(), timeout);
    if (!result) {
      markHealth(p.id, false, 'provider tidak menyediakan file/manifest yang tervalidasi');
      return { ok: false, error: 'Tidak ada file video/manifest yang dapat divalidasi; embed bukan stream langsung.', ms: Date.now() - t0 };
    }
    const servers = result.chosen.map((candidate, i) => ({
      name: candidate.name || (result.kind === 'direct-media' ? 'Server ' + (i + 1) : 'Embed'),
      id: candidate.ref,
      quality: candidate.quality,
      def: i === 0
    }));
    result.stream.playerUrl = result.chosen[0].ref;
    result.stream.sourceKind = result.kind;
    result.stream.servers = servers;
    const grouped = new Map<string, typeof servers>();
    servers.forEach(server => {
      const label = server.quality || 'Server';
      const list = grouped.get(label) || [];
      list.push(server);
      grouped.set(label, list);
    });
    result.stream.qualities = Array.from(grouped, ([title, list]) => ({ title, servers: list }));
    markHealth(p.id, true);
    return { ok: true, stream: result.stream, ms: Date.now() - t0 };
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
 * Resolver terpusat: percobaan memakai reference anime/episode milik
 * provider itu sendiri. URL halaman embed tidak disamakan dengan file media.
 */
export const FallbackEngine = {
  /** Resolusi berurutan (kompatibilitas): coba penyedia sesuai prioritas sampai berhasil. */
  async resolveStream(preferred: string, params: StreamParams, opts: { skip?: string; alternatives?: StreamRequest[] } = {}): Promise<StreamResolution> {
    const attempts: StreamAttempt[] = [];
    // Never reuse a provider's anime/episode ID on another provider. Callers
    // must supply a matched reference for each fallback source explicitly.
    const candidates: StreamRequest[] = [
      { provider: preferred, params },
      ...(opts.alternatives || []).filter(request => request.provider !== preferred)
    ].filter(request => request.provider !== opts.skip);
    candidates.sort((a, b) => streamingPriority(a.provider) - streamingPriority(b.provider));

    for (const request of candidates) {
      const p = getProvider(request.provider);
      if (!p) continue;
      const r = await tryProvider(p, request.params);
      attempts.push({ provider: p.id, ok: r.ok, error: r.error, ms: r.ms });
      if (r.ok && r.stream) {
        return { stream: r.stream, provider: p.id, attempts, sourceKind: r.stream.sourceKind };
      }
    }
    return { stream: null, provider: null, attempts };
  },

  /** Provider dicoba berurutan. Setiap request harus membawa ID provider-specific. */
  async resolveAll(
    requests: StreamRequest[],
    opts: { timeout?: number; max?: number } = {}
  ): Promise<{ results: ResolvedStream[]; attempts: StreamAttempt[] }> {
    const timeout = opts.timeout || STREAM_TIMEOUT;
    const list = requests.slice(0, Math.min(opts.max || 6, 6)).slice().sort((a, b) => {
      const pa = streamingPriority(a.provider);
      const pb = streamingPriority(b.provider);
      return pa - pb;
    });
    const settled = await Promise.all(list.map(async req => {
      const p = getProvider(req.provider);
      const r = p ? await tryProvider(p, req.params, timeout) : { ok: false, error: 'tidak tersedia', ms: 0 };
      return { req, r };
    }));
    const results: ResolvedStream[] = [];
    const attempts: StreamAttempt[] = [];
    // Promise.all preserves provider priority order regardless of completion
    // order, while bounding the whole fallback wave to one provider timeout.
    for (const { req, r } of settled) {
      attempts.push({ provider: req.provider, ok: r.ok, error: r.error, ms: r.ms });
      if (r.ok && r.stream) results.push({ provider: req.provider, stream: r.stream, ms: r.ms });
    }
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
    const provider = getProvider(preferred);
    if (!provider || typeof provider.downloads !== 'function') return { links: [], byProvider: [] };
    try {
      const links = await CacheManager.downloads(
        provider.id,
        params.episodeId || params.animeId || '',
        () => provider.downloads!(params)
      );
      const byProvider = links.length ? [{ provider: provider.id, links }] : [];
      return { links: mergeDownloads([links]), byProvider };
    } catch (error: any) {
      return { links: [], byProvider: [{ provider: provider.id, links: [], error: String(error?.message || error) }] };
    }
  },

  /** Catatan fallback netral untuk UI — tanpa menyebut nama sumber apa pun. */
  summary(provider: string | null, attempts: StreamAttempt[]): string {
    if (!provider) return '';
    const idx = attempts.findIndex(a => a.provider === provider);
    if (idx <= 0) return '';
    return 'Sumber utama sedang sibuk — otomatis dialihkan ke sumber cadangan.';
  }
};
