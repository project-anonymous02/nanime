import { PROVIDERS, TTL } from './config';
import { apiGet } from './client';
import { normalizeCard } from './normalize';
import { API } from './api';
import { cleanVal, normalizeSearchText } from './utils';
import type { Card } from './types';
import type { ScrapeTask } from './scraper';

const task = (provider: string, action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
  provider: provider as ScrapeTask['provider'], action, ...extra
});

export function normMovieTitle(s: unknown): string {
  return normalizeSearchText(
    String(s || '')
      .replace(/\((?:episode|eps)?\s*\d+\s*[–-]\s*\d+\)/gi, ' ')
      .replace(
        /\b(subtitle indonesia|sub indo|batch|bd|web-?dl|webdl|dub|dubbed|indonesia|complete|movie|film|ova|ona|special|season|s\d+|part\s*\d+|episode|eps?|\d{4})\b/gi,
        ' '
      )
  ).replace(/\s+/g, ' ').trim();
}

export function titleMatchScore(source: string, candidate: string): number {
  const a = normMovieTitle(source);
  const b = normMovieTitle(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(' ').filter(t => t.length > 1);
  const tb = b.split(' ').filter(t => t.length > 1);
  if (!ta.length || !tb.length) return 0;
  const setb = new Set(tb);
  const hit = ta.filter(t => setb.has(t)).length;
  const cov = Math.min(hit / ta.length, hit / tb.length);
  if (hit >= 2 && cov >= 0.8) return cov;
  if (hit >= 1 && ta.length === 1 && tb.length === 1) return 0.7;
  return 0;
}

export interface MovieResolve {
  provider: string;
  id: string;
  slug: string;
  title: string;
  poster: string;
  epNum: string;
  eid: string;
  eslug: string;
  match: number;
}

/**
 * Cari sumber yang bisa diputar untuk judul movie (Kusonime hanya punya
 * unduhan) dengan memindai provider streaming lain, lalu ambil episode pertamanya.
 */
export async function resolveMovieSource(anime: {
  title: string;
  id?: string;
  slug?: string;
}): Promise<MovieResolve | null> {
  const title = cleanVal(anime && anime.title);
  if (!title) return null;

  const cleaned = normMovieTitle(title);
  const queries = [...new Set([cleaned, title].filter(q => q && q.length >= 2))];
  const found: (Card & { match: number })[] = [];
  const seen = new Set<string>();

  for (const pid of ['otakudesu', 'oploverz']) {
    for (const q of queries) {
      let list: Card[] = [];
      try {
        const r = await apiGet(task(pid as 'otakudesu' | 'oploverz', 'search', { query: q }), 20000, 'mres:' + pid + ':' + q, TTL.search);
        list = (r?.data?.animeList || []).map((i: any) => normalizeCard(i, pid)).filter(Boolean);
      } catch (e: any) {
        if (e?.status !== 404) console.warn('Movie resolve search failed:', pid, e);
        continue;
      }
      list.forEach(c => {
        const key = pid + ':' + c.id;
        if (seen.has(key)) return;
        const sc = titleMatchScore(title, c.title);
        if (sc > 0) {
          seen.add(key);
          found.push(Object.assign({}, c, { match: sc }));
        }
      });
      if (found.length) break;
    }
    if (found.length) break;
  }

  if (!found.length) return null;
  found.sort(
    (x, y) => y.match - x.match || (PROVIDERS[x.provider]?.priority || 9) - (PROVIDERS[y.provider]?.priority || 9)
  );
  const best = found[0];
  try {
    const det = await API.detail(best.provider, best.id, best.slug || '');
    const ep = (det.episodeList || [])[0];
    if (!ep) return null;
    return {
      provider: det.provider,
      id: det.id,
      slug: det.slug || '',
      title: det.title,
      poster: det.poster || '',
      epNum: ep.num,
      eid: ep.id || '',
      eslug: ep.slug || '',
      match: best.match
    };
  } catch (e) {
    console.warn('Movie resolve detail failed:', e);
    return null;
  }
}
