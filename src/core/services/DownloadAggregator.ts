import type { AnimeProvider } from '../../providers/types';
import { downloadProviders } from '../../providers/registry';
import type { Card, DownloadLink } from '../types';
import { CacheManager } from './CacheManager';
import { matchScore } from '../utils/fuzzyMatch';
import { findByEpisode, mergeDownloads } from './EpisodeMatcher';

/**
 * DownloadAggregator — "gabung-gabung provider dengan sistem yang tepat".
 *
 * Untuk satu judul + episode, setiap provider unduhan diselesaikan lewat jalur
 * yang paling andal:
 *   1. Provider sumber saat ini → pakai episodeId langsung (paling akurat).
 *   2. Provider lain → cari judul di provider itu, pilih kartu paling cocok,
 *      buka detail, cocokkan nomor episode, lalu ambil tautan unduhnya.
 * Semua tautan digabung & diduplikasi berdasarkan URL.
 */

export interface DownloadQuery {
  /** Judul anime untuk resolusi lintas-provider. */
  title?: string;
  /** Nomor/label episode (mis. "5"). */
  episode?: string;
  /** ID episode pada provider sumber saat ini. */
  episodeId?: string;
  episodeSlug?: string;
  animeId?: string;
  animeSlug?: string;
  /** Provider sumber saat ini (dipakai lebih dulu). */
  preferred?: string;
}

export interface ProviderDownloads {
  provider: string;
  name: string;
  links: DownloadLink[];
  error?: string;
}

export interface DownloadCollection {
  links: DownloadLink[];
  byProvider: ProviderDownloads[];
}

/** Ambang kemiripan judul agar tidak salah ambil series lain. */
const MATCH_MIN = 52;

/** Pilih kartu hasil pencarian yang paling cocok dengan judul target. */
export function pickBestCard(cards: Card[], title: string): Card | null {
  let best: Card | null = null;
  let bestScore = -1;
  for (const c of cards) {
    const s = matchScore(title, c.title || '');
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= MATCH_MIN ? best : null;
}

/** Resolusi episode pada provider lain lewat judul: search → detail → episode. */
async function resolveByTitle(p: AnimeProvider, q: DownloadQuery): Promise<DownloadLink[]> {
  if (!p.search || !q.title || typeof p.downloads !== 'function') return [];
  const cards = await p.search(q.title);
  const card = pickBestCard(cards || [], q.title);
  if (!card) return [];
  const det = await p.detail(card.id, card.slug || '');
  const list = det.episodeList || [];
  const key = q.episode || '';
  const ep = key ? findByEpisode(list, key) : undefined;
  return p.downloads({
    animeId: card.id,
    animeSlug: card.slug || card.id,
    episodeId: ep ? ep.id : undefined,
    episodeSlug: ep ? ep.slug : undefined,
    episode: q.episode
  });
}

/** Ambil unduhan dari satu provider sesuai jalur terbaik yang tersedia. */
async function collectOne(p: AnimeProvider, q: DownloadQuery): Promise<DownloadLink[]> {
  if (typeof p.downloads !== 'function') return [];
  const isSource = q.preferred === p.id && !!q.episodeId;
  const key = q.title + ':' + (q.episode || q.episodeId || q.animeSlug || '');
  return CacheManager.downloads(p.id, key, () => {
    if (isSource) {
      return p.downloads!({
        animeId: q.animeId,
        animeSlug: q.animeSlug,
        episodeId: q.episodeId,
        episodeSlug: q.episodeSlug,
        episode: q.episode
      });
    }
    return resolveByTitle(p, q);
  });
}

export const DownloadAggregator = {
  async collect(q: DownloadQuery): Promise<DownloadCollection> {
    const providers = downloadProviders().slice().sort((a, b) => {
      if (a.id === q.preferred) return -1;
      if (b.id === q.preferred) return 1;
      return a.priority - b.priority;
    });
    const byProvider: ProviderDownloads[] = [];

    // Providers run sequentially to preserve priority and avoid a burst of
    // unrelated scraping. The result retains each source as a separate link.
    for (const p of providers) {
      try {
        const links = await collectOne(p, q);
        if (links && links.length) byProvider.push({ provider: p.id, name: p.name, links });
      } catch (e: any) {
        byProvider.push({ provider: p.id, name: p.name, links: [], error: String(e?.message || e) });
      }
    }

    return { links: mergeDownloads(byProvider.map(b => b.links)), byProvider };
  }
};
