/** Utilitas pengurutan/pengelompokan kualitas unduhan. */

const CANON: [RegExp, number][] = [
  [/\b(4k|2160p?|uhd)\b/i, 4000],
  [/\b1080p?\b|\bfull\s?hd\b/i, 1080],
  [/\b720p?\b|\bhd\b/i, 720],
  [/\b480p?\b/i, 480],
  [/\b360p?\b|\bsd\b/i, 360],
  [/\b240p?\b/i, 240]
];

/** Ubah label kualitas apa pun menjadi angka pembanding (0 bila tak dikenali). */
export function qualityRank(label: string): number {
  const s = String(label || '');
  for (const [re, val] of CANON) if (re.test(s)) return val;
  const m = s.match(/(\d{3,4})/);
  return m ? Number(m[1]) : 0;
}

/** Label kualitas kanonik untuk tampilan ("1080p", "720p", ...). */
export function canonicalQuality(label: string): string {
  const r = qualityRank(label);
  if (r === 4000) return '4K';
  if (r) return r + 'p';
  return String(label || 'Lainnya').trim() || 'Lainnya';
}

/** Kelompokkan tautan unduh per kualitas, urut dari tertinggi ke terendah. */
export function groupByQuality<T extends { quality: string }>(links: T[]): { quality: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const l of links) {
    const q = canonicalQuality(l.quality);
    (map.get(q) || map.set(q, []).get(q)!).push(l);
  }
  return Array.from(map.entries())
    .map(([quality, items]) => ({ quality, items }))
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
}

/** Daftar kualitas yang tersedia (untuk filter "ada 720p / 1080p"). */
export function hasQuality(links: { quality: string }[], min: number): boolean {
  return links.some(l => qualityRank(l.quality) >= min);
}
