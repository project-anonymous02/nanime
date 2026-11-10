import type { AnimeProvider } from '../../providers/types';
import { markHealth, getProvider, streamingPriority } from '../../providers/registry';
import type { DownloadLink, EpisodeStream } from '../types';
import { httpGetText, httpProbe, httpRangeProbe } from '../http';
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

/** Mirror episode diselesaikan paralel, dengan waktu cukup untuk seluruh daftar. */
const STREAM_TIMEOUT = 20000;

interface DirectMediaCheck {
  media: boolean;
  verified: boolean;
  mime?: string;
  probe?: { status: number; contentType: string } | null;
}

/** Deteksi signature media dari beberapa KB pertama respons. */
function looksLikeMediaPrefix(prefix: string, contentType: string): boolean {
  if (/^(?:video|audio)\//.test(contentType)) return true;
  if (!prefix) return false;
  if (prefix.startsWith('#EXTM3U')) return true;
  if (/<MPD(?:\s|>)/i.test(prefix.slice(0, 4096))) return true;
  if (prefix.slice(4, 8) === 'ftyp') return true; // ISO BMFF (mp4/mov)
  if (prefix.startsWith('ID3') || prefix.startsWith('FLV') || prefix.startsWith('OggS')) return true;
  if (prefix.charCodeAt(0) === 0x47) return true; // MPEG-TS
  if (prefix.charCodeAt(0) === 0x1a && prefix.charCodeAt(1) === 0x45 && prefix.charCodeAt(2) === 0xdf && prefix.charCodeAt(3) === 0xa3) return true; // EBML (webm/mkv)
  return false;
}

/**
 * Klasifikasi satu URL: file media langsung atau bukan. HEAD dipakai lebih
 * dulu, tetapi kegagalan HEAD (403/404/405/501) tidak dianggap bukti bahwa GET
 * media gagal — verifikasi dilanjutkan dengan ranged GET.
 */
async function inspectDirectMedia(url: string): Promise<DirectMediaCheck> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { media: false, verified: false }; }
  const path = parsed.pathname.toLowerCase();
  const isHls = path.endsWith('.m3u8');
  const isDash = path.endsWith('.mpd');
  if (!isHls && !isDash && !isVideoUrl(parsed.href)) return { media: false, verified: false };

  let probe: { status: number; contentType: string } | null = null;
  try { probe = await httpProbe(parsed.href); } catch { probe = null; }

  if (probe && probe.status >= 200 && probe.status < 300) {
    const mime = probe.contentType;
    if (/^(?:video|audio)\//.test(mime)) return { media: true, verified: true, mime, probe };
    if (isHls || isDash) {
      const expectedMime = isHls
        ? ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl']
        : ['application/dash+xml'];
      if (mime && !expectedMime.includes(mime) && mime !== 'text/plain' && mime !== 'application/octet-stream') {
        return { media: false, verified: false, probe };
      }
      try {
        const response = await httpGetText(parsed.href, { timeout: 5000, retries: 0, corsOk: true });
        const ok = isHls
          ? /^\s*#EXTM3U(?:\s|$)/.test(response.text)
          : /<MPD(?:\s|>)/i.test(response.text.slice(0, 4096));
        return ok
          ? { media: true, verified: true, mime: mime || undefined, probe }
          : { media: false, verified: false, probe };
      } catch {
        return { media: false, verified: false, probe };
      }
    }
    if (/^(?:text\/html|application\/xhtml\+xml|application\/json)$/.test(mime)) {
      return { media: false, verified: false, probe };
    }
    // 2xx pada URL berekstensi media dengan MIME opaque: biarkan pemutar kustom
    // mencobanya, tetapi tandai belum terverifikasi.
    return { media: true, verified: false, mime: mime || undefined, probe };
  }

  // HEAD ditolak/gagal. Manifest kecil: verifikasi signature dengan GET biasa.
  if (isHls || isDash) {
    try {
      const response = await httpGetText(parsed.href, { timeout: 5000, retries: 0, corsOk: true });
      const ok = isHls
        ? /^\s*#EXTM3U(?:\s|$)/.test(response.text)
        : /<MPD(?:\s|>)/i.test(response.text.slice(0, 4096));
      return ok
        ? { media: true, verified: true, mime: isHls ? 'application/vnd.apple.mpegurl' : 'application/dash+xml', probe }
        : { media: false, verified: false, probe };
    } catch {
      return { media: false, verified: false, probe };
    }
  }

  // URL berekstensi media dengan HEAD ditolak: coba ranged GET sebelum
  // memutuskan. Server dapat menolak HEAD namun tetap melayani GET.
  try {
    const ranged = await httpRangeProbe(parsed.href);
    if (looksLikeMediaPrefix(ranged.prefix, ranged.contentType)) {
      return { media: true, verified: true, mime: ranged.contentType || undefined, probe };
    }
    if (/^(?:text\/html|application\/xhtml\+xml)$/.test(ranged.contentType)) {
      return { media: false, verified: false, probe };
    }
    if (ranged.status >= 200 && ranged.status < 300) {
      return ranged.prefix
        ? { media: false, verified: false, probe }
        : { media: true, verified: false, probe };
    }
    return { media: false, verified: false, probe };
  } catch {
    // Inkonklusif (timeout/jaringan/CORS): URL berekstensi media tetap dicoba
    // sebagai media; watchdog pemutar akan lanjut ke sumber berikutnya bila gagal.
    return { media: true, verified: false, probe };
  }
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
      const raw: { name: string; ref: string; quality?: string; sourceRef?: string }[] = [];
      const seen = new Set<string>();
      const pushRef = (ref: string, name: string, quality?: string) => {
        if (!ref || seen.has(ref)) return;
        seen.add(ref);
        raw.push({ name, ref, quality: quality || qualityByRef.get(ref) || undefined });
      };
      const isOtakudesuEpisodePage = (() => {
        if (p.id !== 'otakudesu' || !stream.playerUrl) return false;
        try {
          const url = new URL(stream.playerUrl);
          return /(?:^|\.)otakudesu\.(?:blog|com|net)$/.test(url.hostname) && /\/episode\//i.test(url.pathname);
        } catch {
          return false;
        }
      })();
      if (!isOtakudesuEpisodePage) pushRef(stream.playerUrl, 'Utama');
      (stream.servers || []).forEach(server => pushRef(server.id, server.name, server.quality));
      const ranked = raw;
      const candidateOrder = new Map(ranked.map((candidate, index) => [candidate.ref, index]));
      const httpCandidates = ranked.filter(candidate => /^https?:\/\//i.test(candidate.ref));
      const opaqueCandidates = ranked.filter(candidate => !/^https?:\/\//i.test(candidate.ref));
      const candidates = [...httpCandidates, ...opaqueCandidates];
      if (!candidates.length) return null;

      interface ChosenCandidate {
        name: string;
        ref: string;
        quality?: string;
        sourceRef?: string;
        kind: 'file' | 'embed';
        mime?: string;
        verified?: boolean;
      }
      const media: ChosenCandidate[] = [];
      const embeds: ChosenCandidate[] = [];
      const extractFile = async (candidate: typeof raw[number], target: string): Promise<ChosenCandidate | null> => {
        try {
          const resolved = await resolveMediaUrl(target);
          if (resolved.kind !== 'file' || !resolved.url) return null;
          const check = await inspectDirectMedia(resolved.url);
          if (!check.media) return null;
          return { ...candidate, ref: resolved.url, sourceRef: candidate.ref, kind: 'file', mime: check.mime, verified: check.verified };
        } catch {
          return null;
        }
      };
      const inspect = async (candidate: typeof raw[number]) => {
        let url = candidate.ref;
        if (!/^https?:\/\//i.test(url)) {
          if (!p.resolveServer) return;
          try { url = await p.resolveServer(url); } catch { return; }
        }
        if (!url) return;

        // 1. File media langsung. Host yang menolak HEAD tetapi melayani GET
        //    tetap terdeteksi lewat verifikasi ranged di inspectDirectMedia.
        const direct = await inspectDirectMedia(url);
        if (direct.media) {
          media.push({ ...candidate, ref: url, sourceRef: candidate.ref, kind: 'file', mime: direct.mime, verified: direct.verified });
          return;
        }

        const sameEpisodePage = (() => {
          try {
            return /^https?:\/\//i.test(params.episodeId) && new URL(url).href === new URL(params.episodeId).href;
          } catch {
            return false;
          }
        })();
        if (sameEpisodePage) return;

        // 2. Halaman HTML: ekstrak media langsung dulu. Iframe provider hanya
        //    dipertahankan bila tidak ada media yang bisa diresolusi.
        let probe = direct.probe ?? null;
        if (!probe) {
          try { probe = await httpProbe(url, 4000); } catch { probe = null; }
        }
        if (probe && probe.status >= 200 && probe.status < 300) {
          if (/^(?:text\/html|application\/xhtml\+xml)$/.test(probe.contentType)) {
            const extracted = await extractFile(candidate, url);
            if (extracted) { media.push(extracted); return; }
            embeds.push({ ...candidate, ref: url, sourceRef: candidate.ref, kind: 'embed' });
            return;
          }
          if (/^(?:video|audio)\//.test(probe.contentType)) {
            media.push({ ...candidate, ref: url, sourceRef: candidate.ref, kind: 'file', mime: probe.contentType, verified: true });
            return;
          }
        }

        // 3. Bukan file: ekstraksi dari halaman sebelum jatuh ke iframe.
        const extracted = await extractFile(candidate, url);
        if (extracted) { media.push(extracted); return; }
        embeds.push({ ...candidate, ref: url, sourceRef: candidate.ref, kind: 'embed' });
      };

      // Resolve every server so the player can show all real mirrors grouped
      // by the quality declared on the episode page.
      for (const batch of [httpCandidates, opaqueCandidates]) {
        await Promise.all(batch.map(inspect));
      }
      if (!media.length && !embeds.length) return null;
      const chosen = [...media, ...embeds].sort((a, b) => (candidateOrder.get(a.sourceRef || a.ref) ?? Infinity) - (candidateOrder.get(b.sourceRef || b.ref) ?? Infinity));
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
      def: i === 0,
      kind: candidate.kind,
      mime: candidate.mime
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
