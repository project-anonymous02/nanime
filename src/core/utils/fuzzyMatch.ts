import { aliasKey, aliasesOf, splitSeason } from './titleAliases';

/** Normalisasi judul untuk perbandingan (bukan untuk ditampilkan). */
export function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(season|part|subtitle|sub|indo|indonesia|full|batch|episode|ep)\b/g, ' ')
    .replace(/\bs\d+\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeTitle(s).split(' ').filter(t => t.length > 1);
}

/** Levenshtein → kesamaan 0..1. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x && !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

/**
 * Skor kecocokan judul hasil terhadap query, 0..100.
 * Memperhitungkan exact match, alias/sinonim, musim, dan token overlap.
 */
export function matchScore(query: string, title: string): number {
  const q = normalizeTitle(query);
  const t = normalizeTitle(title);
  if (!q || !t) return 0;

  let score = 0;
  if (q === t) score = 100;
  else if (t.startsWith(q) || q.startsWith(t)) score = 88;
  else if (t.includes(q) || q.includes(t)) score = 78;

  const qTokens = tokens(query);
  const tTokens = tokens(title);
  const set = new Set(tTokens);
  const hit = qTokens.filter(tok => set.has(tok)).length;
  const overlap = qTokens.length ? hit / qTokens.length : 0;
  score = Math.max(score, overlap * 72);

  /* Sinonim: Kimetsu no Yaiba == Demon Slayer. */
  const qa = aliasKey(query);
  if (qa) {
    if (aliasesOf(title).some(a => aliasKey(a) === qa)) score = Math.max(score, 90);
  }

  /* Booster fuzzy untuk salah ketik. */
  const sim = similarity(query, title);
  if (sim > 0.85) score = Math.max(score, 62 + (sim - 0.85) * 100);
  else score = Math.max(score, sim * 55);

  /* Penalti bila musim berbeda tetapi dasar judul sama. */
  const qs = splitSeason(query);
  const ts = splitSeason(title);
  if (qs.season && ts.season && qs.season !== ts.season && normalizeTitle(qs.base) === normalizeTitle(ts.base)) {
    score -= 25;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
