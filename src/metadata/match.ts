import { normalizeSearchText } from '../core/utils';
import type { AnimeMeta, MetaAnimeBrief } from '../core/types';

/**
 * Matcher judul penyedia (oploverz/otakudesu/…) ↔ metadata AniList/Kitsu.
 *
 * Kebijakan keyakinan sesuai permintaan pengguna:
 *  - skor >= AUTO_LINK  → auto-link aman.
 *  - SUGGEST <= skor < AUTO_LINK → hanya saran (tampil sebagai opsi, tidak menyatu).
 *  - skor < SUGGEST    → jangan dihubungkan sama sekali (null).
 */

export const AUTO_LINK = 0.78;
export const SUGGEST = 0.6;

/** Hilangkan penanda episode/download yang menempel di judul provider. */
function stripNoise(s: string): string {
  return normalizeSearchText(
    s
      .replace(/\((?:episode|eps)?\s*\d+(\s*[–-]\s*\d+)?\)/gi, ' ')
      .replace(/\b(subtitle\s+indonesia|sub\s+indo|subbed|softsub|hardsub|dubbed|dub|batch|bd(?:rip)?|web-?dl|hdtv|hdr|complete|telecast|final|v\s*\d+)\b/gi, ' ')
      .replace(/\bepisode\s*\d+(?:\s*[–-]\s*\d+)?\b/gi, ' ')
      .replace(/\beps?\s*\d+\b/gi, ' ')
      .replace(/\b\d{3,4}\s*p\b/gi, ' ')
  ).replace(/\s+/g, ' ').trim();
}

/** Samakan penanda musim: "2nd Season"/"Season 2"/"S2" → token musim tunggal. */
function canonSeasons(s: string): string {
  let t = ' ' + s + ' ';
  t = t.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, ' season $1 ');
  t = t.replace(/\bseason\s*(\d+)\b/gi, ' season $1 ');
  t = t.replace(/\bs(\d{1,2})\b/gi, ' season $1 ');
  // Musim romawi di akhir judul: "Kimetsu no Yaiba Infinity Castle III"
  t = t.replace(/\b(ii|iii|iv|v)\s*$/i, (_m, r: string) => {
    const map: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5' };
    return ' season ' + map[r.toLowerCase()] + ' ';
  });
  return t.replace(/\s+/g, ' ').trim();
}

/** Token identitas judul (musim ikut dihitung agar musim 1 ≠ musim 2). */
export function titleTokens(s: string): string[] {
  const canon = canonSeasons(stripNoise(s));
  const toks = canon.split(' ').filter(t => t.length > 1 && t !== 'season');
  // "season" digabung berpasangan dengan angkanya → token "s2" tunggal
  const out: string[] = [];
  const words = canon.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'season' && words[i + 1] && /^\d+$/.test(words[i + 1])) {
      out.push('s' + words[i + 1]);
      i++;
      continue;
    }
    if (words[i] === 'season') continue;
    if (words[i].length <= 1 && !/^\d+$/.test(words[i])) continue; // buang partikel 1-huruf ("x", "no" tetap — panjang 2)
    out.push(words[i]);
  }
  return out.length ? [...new Set(out)] : toks;
}

function dice(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setb = new Set(b);
  const hit = a.filter(t => setb.has(t)).length;
  return (2 * hit) / (a.length + b.length);
}

/** Token musim ("s2") — beda musim jangan pernah auto-link. */
function seasonSet(toks: string[]): Set<string> {
  return new Set(toks.filter(t => /^s\d+$/.test(t)));
}

/** Kata penanda edisi khusus pada kandidat katalog → tak boleh auto-link. */
const EDITION_TOKENS = new Set(['recap', 'ova', 'ona', 'special', 'movie', 'film', 'bonus', 'omake']);

/** Judul bersih untuk dikirim ke mesin pencarian metadata (buang episode/sub/batch). */
export function cleanQuery(title: string): string {
  return stripNoise(title);
}

function sameSeasons(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Skor kecocokan 0..1 antara judul provider dan satu kandidat metadata. */
export function matchScore(sourceTitle: string, candidates: MetaAnimeBrief | { title: string; synonyms?: string[] }): number {
  const ta = titleTokens(sourceTitle);
  if (!ta.length) return 0;
  const sa = seasonSet(ta);
  let best = 0;
  const names = [
    candidates.title,
    ...((candidates as MetaAnimeBrief & { titleRomaji?: string }).titleRomaji ? [(candidates as MetaAnimeBrief & { titleRomaji?: string }).titleRomaji!] : []),
    ...('synonyms' in candidates ? (candidates.synonyms || []) : [])
  ].filter(Boolean) as string[];

  for (const name of names) {
    const tb = titleTokens(name);
    if (!tb.length) continue;
    const a = ta.join(' ');
    const b = tb.join(' ');
    let sc = 0;
    if (a === b) {
      sc = 1;
    } else {
      sc = dice(ta, tb);
      // Kedua arah containment (mis. "suzume" ⊂ "suzume movie")
      const shorter = Math.min(a.length, b.length);
      const longer = Math.max(a.length, b.length);
      if (shorter >= 4 && (a.includes(b) || b.includes(a))) {
        sc = Math.max(sc, 0.82 * (shorter / longer) + 0.14);
      }
    }
    // Musim berbeda (satu pihak pakai penanda musim, satu lagi tidak / beda angka)
    // → cap ke zona saran, tidak boleh auto-link.
    if (sc > 0.7 && !sameSeasons(sa, seasonSet(tb))) sc = 0.7;
    // Kandidat membawa penanda edisi khusus (Recap/OVA/Movie…) yang tak ada di
    // judul provider → turunkan ke zona saran (jangan auto-link).
    if (sc > 0.75) {
      const extra = tb.some(t => EDITION_TOKENS.has(t) && !ta.includes(t));
      if (extra) sc = 0.75;
    }
    best = Math.max(best, sc);
  }
  return best;
}

export interface MatchResult<T = MetaAnimeBrief> {
  meta: T;
  score: number;
  auto: boolean;
}

/**
 * Pilih kandidat metadata terbaik untuk satu judul provider.
 * Keyakinan rendah (< SUGGEST) → null (tidak dihubungkan).
 * Keyakinan menengah → auto:false (saran saja, UI wajib minta konfirmasi).
 */
export function pickBest<T extends MetaAnimeBrief>(
  sourceTitle: string,
  candidates: T[],
  opts: { autoMin?: number; suggestMin?: number } = {}
): MatchResult<T> | null {
  const autoMin = opts.autoMin ?? AUTO_LINK;
  const suggestMin = opts.suggestMin ?? SUGGEST;
  let best: MatchResult<T> | null = null;
  for (const c of candidates) {
    if (!c.title) continue;
    let score = matchScore(sourceTitle, c);
    // Bonus format bila keduanya movie (konteks pemutar movie provider)
    if (c.format && /movie|film/i.test(c.format) && /\bmovie\b/i.test(sourceTitle)) score = Math.min(1, score + 0.05);
    if (!best || score > best.score) best = { meta: c, score, auto: score >= autoMin };
  }
  if (!best || best.score < suggestMin) return null;
  return best;
}

/**
 * Nilai tahun ketika keduanya diketahui — dipakai penalti bila jauh berbeda
 * (musim/season remaster kerap tercampur). Dipanggil oleh integrator detail.
 */
export function yearPenalty(sourceYear: number | undefined, metaYear: number | undefined): number {
  if (!sourceYear || !metaYear) return 0;
  const diff = Math.abs(sourceYear - metaYear);
  if (diff === 0) return 0;
  if (diff === 1) return 0.03;
  if (diff <= 2) return 0.1;
  return 0.35;
}

/** Ekstrak tahun dari judul provider (mis. "… (2023)"). */
export function yearFromTitle(s: string): number | undefined {
  const m = String(s || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

/** Gabungan: pickBest + penalti tahun (dari judul provider vs tahun kandidat). */
export function matchMeta(sourceTitle: string, candidates: MetaAnimeBrief[]): MatchResult | null {
  const res = pickBest(sourceTitle, candidates);
  if (!res) return null;
  const pen = yearPenalty(yearFromTitle(sourceTitle), res.meta.year);
  res.score = Math.max(0, res.score - pen);
  res.auto = res.score >= AUTO_LINK;
  return res.score < SUGGEST ? null : res;
}
