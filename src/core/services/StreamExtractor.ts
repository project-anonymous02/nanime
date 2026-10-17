import { httpGetText } from '../http';
import { isVideoUrl } from '../utils';
import { qualityRank } from '../utils/qualitySorter';
import { CacheManager, TTL } from './CacheManager';

/**
 * StreamExtractor — menerjemahkan URL halaman/embed provider menjadi URL video
 * langsung (MP4/M3U8) sehingga pemutar kustom SELALU bisa memakai `<video>`.
 *
 * Pemutar kustom tidak pernah menampilkan pemutar bawaan provider:
 *   1. URL sudah file (mp4/m3u8) → pakai langsung.
 *   2. URL embed → ambil HTML-nya, gali URL file (sumber <source>, deklarasi
 *      `file:`/`src:`/`url:` pada JS/JSON, atau URL absolut apa pun yang
 *      berakhiran .m3u8/.mp4). Bila halaman embed menunjuk embed lain, telusuri
 *      satu tingkat.
 *   3. Tidak berhasil → kembalikan URL asli sebagai `embed` (iframe) — jalan
 *      terakhir, tanpa hardcoding sumber tertentu.
 */

export interface ResolvedMedia {
  url: string;
  kind: 'file' | 'embed';
}

const FETCH_TIMEOUT = 12000;
const MAX_DEPTH = 2;

const VIDEO_URL_RE = /https?:\/\/[^\s"'`<>\\]+?\.(?:m3u8|mp4|webm|mov)(?:\?[^\s"'`<>\\]*)?/gi;

const KEYED_PATTERNS: RegExp[] = [
  /file\s*[:=]\s*["']([^"']+)["']/gi,
  /src\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm|mov)[^"']*)["']/gi,
  /url\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm|mov)[^"']*)["']/gi,
  /source\s+src=["']([^"']+)["']/gi
];

const IFRAME_RE = /<iframe[^>]+src=["']([^"']+)["']/gi;

function absolutize(raw: string, base: string): string {
  const u = String(raw || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .trim();
  if (!u || u.startsWith('data:') || u.startsWith('blob:')) return '';
  try {
    return new URL(u, base).toString();
  } catch {
    return /^https?:\/\//i.test(u) ? u : '';
  }
}

/** Kumpulkan semua kandidat URL video dari dalam sebuah halaman embed. */
export function extractMediaCandidates(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const u = absolutize(raw, baseUrl);
    if (!u || seen.has(u) || !isVideoUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const re of KEYED_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) push(m[1]);
  }

  VIDEO_URL_RE.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = VIDEO_URL_RE.exec(html))) push(hit[0]);

  return out;
}

/** URL embed lain di dalam halaman (untuk ditelusuri satu tingkat). */
export function extractEmbedUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  IFRAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IFRAME_RE.exec(html))) {
    const u = absolutize(m[1], baseUrl);
    if (!u || seen.has(u) || isVideoUrl(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** Pilih kandidat terbaik: resolusi tertinggi dulu, M3U8 diutamakan (adaptive). */
export function pickBestCandidate(urls: string[]): string {
  if (!urls.length) return '';
  return urls
    .slice()
    .sort((a, b) => {
      const d = qualityRank(b) - qualityRank(a);
      if (d) return d;
      const ah = /\.m3u8(\?|#|$)/i.test(a) ? 1 : 0;
      const bh = /\.m3u8(\?|#|$)/i.test(b) ? 1 : 0;
      return bh - ah;
    })[0];
}

async function crawl(url: string, depth: number): Promise<string> {
  const { text } = await httpGetText(url, {
    timeout: FETCH_TIMEOUT,
    retries: 1,
    headers: {
      Referer: new URL(url).origin + '/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const direct = extractMediaCandidates(text, url);
  if (direct.length) return pickBestCandidate(direct);
  if (depth >= MAX_DEPTH) return '';
  for (const next of extractEmbedUrls(text, url)) {
    try {
      const found = await crawl(next, depth + 1);
      if (found) return found;
    } catch {
      /* embed berikutnya */
    }
  }
  return '';
}

/**
 * Ubah URL apa pun menjadi media yang bisa diputar pemutar kustom.
 * Hasil (termasuk kegagalan) di-cache selama TTL stream agar tidak
 * melakukan scraping berulang untuk URL yang sama.
 */
export async function resolveMediaUrl(url: string): Promise<ResolvedMedia> {
  const target = String(url || '').trim();
  if (!target) return { url: '', kind: 'embed' };
  if (isVideoUrl(target)) return { url: target, kind: 'file' };

  return CacheManager.get('play', target, TTL.stream, async () => {
    try {
      const file = await crawl(target, 0);
      if (file) return { url: file, kind: 'file' as const };
    } catch {
      /* scraping gagal → jatuh ke iframe */
    }
    return { url: target, kind: 'embed' as const };
  });
}
