import type { EpisodeItem, EpisodeStream, DownloadLink } from '../types';

/**
 * EpisodeMatcher — menyelaraskan episode dari beberapa provider.
 * Nomor episode jadi kunci; label seperti "Episode 5", "Eps 05", "5 Sub Indo"
 * dinormalisasi ke angka sehingga daftar bisa digabung tanpa duplikat.
 */

/** Ambil nomor episode dari label apa pun; NaN bila tidak ada. */
export function episodeNumber(label: string): number {
  const s = String(label || '');
  const m = s.match(/(?:episode|eps|ep|e)?\s*(\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);
  const m2 = s.match(/(\d+(?:\.\d+)?)/);
  return m2 ? parseFloat(m2[1]) : NaN;
}

/** Kunci stabil untuk satu episode; fallback ke slug bila nomor tak ditemukan. */
export function episodeKey(ep: EpisodeItem): string {
  const n = episodeNumber(ep.title || ep.num || '');
  if (!isNaN(n)) return 'n:' + n;
  return 's:' + (ep.slug || ep.id);
}

/** Label episode yang rapi & seragam untuk ditampilkan. */
export function episodeLabel(ep: EpisodeItem): string {
  const n = episodeNumber(ep.title || ep.num || '');
  if (!isNaN(n)) return 'Episode ' + (Number.isInteger(n) ? n : n.toFixed(1));
  return ep.title || ep.num || 'Episode';
}

export interface MergedEpisode extends EpisodeItem {
  /** Provider yang menyediakan episode nomor ini (urut sesuai prioritas). */
  sources: { provider: string; id: string; slug: string }[];
}

/**
 * Gabungkan daftar episode dari beberapa provider menjadi satu daftar unik,
 * diurutkan menaik. Provider pertama yang menyebut nomor itu menjadi sumber utama.
 */
export function mergeEpisodes(
  groups: { provider: string; items: EpisodeItem[] }[]
): MergedEpisode[] {
  const map = new Map<string, MergedEpisode>();
  for (const g of groups) {
    for (const ep of g.items) {
      const key = episodeKey(ep);
      const existing = map.get(key);
      if (existing) {
        if (!existing.sources.some(s => s.provider === g.provider)) {
          existing.sources.push({ provider: g.provider, id: ep.id, slug: ep.slug });
        }
        if (!existing.date && ep.date) existing.date = ep.date;
      } else {
        map.set(key, { ...ep, sources: [{ provider: g.provider, id: ep.id, slug: ep.slug }] });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const na = episodeNumber(a.title || a.num);
    const nb = episodeNumber(b.title || b.num);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });
}

/** Cari episode pada daftar berdasarkan nomor/label. */
export function findByEpisode(items: EpisodeItem[], want: string): EpisodeItem | undefined {
  const n = episodeNumber(want);
  if (!isNaN(n)) {
    const hit = items.find(e => episodeNumber(e.title || e.num) === n);
    if (hit) return hit;
  }
  return items.find(e => e.slug === want || e.id === want || e.title === want);
}

/** Episode berikutnya relatif terhadap episode sekarang. */
export function nextEpisode(items: EpisodeItem[], current: string): EpisodeItem | undefined {
  const idx = items.findIndex(e => episodeKey(e) === current || findByEpisode([e], current) === e);
  if (idx < 0 || idx >= items.length - 1) return undefined;
  return items[idx + 1];
}

/** Satukan tautan unduh dari banyak sumber, buang duplikat URL. */
export function mergeDownloads(groups: DownloadLink[][]): DownloadLink[] {
  const seen = new Set<string>();
  const out: DownloadLink[] = [];
  for (const g of groups) {
    for (const d of g) {
      if (!d.url || seen.has(d.url)) continue;
      seen.add(d.url);
      out.push(d);
    }
  }
  return out;
}

/** Beberapa provider mengirim judul stream tanpa kualitas; selaraskan dari daftar server. */
export function streamQuality(stream: EpisodeStream, fallback = 'Auto'): string {
  const q = stream.qualities?.[0]?.title;
  return q || fallback;
}
