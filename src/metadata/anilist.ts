import { httpPostJson } from '../core/http';
import { cached } from '../core/client';
import type { AnimeMeta, MetaAnimeBrief, MetaCharacter, MetaRelation, MetaStudio } from '../core/types';

/**
 * AniList GraphQL (https://graphql.anilist.co) — sumber metadata primer.
 * Endpoint publik ber-CORS, dapat diuji langsung di browser maupun APK.
 * Semua permintaan di-cache in-memory; tidak ada kredensial yang dibutuhkan.
 */

const ENDPOINT = 'https://graphql.anilist.co';

const TTL = { brief: 6 * 3600_000, full: 24 * 3600_000 };

const BRIEF_FIELDS = `
  id format episodes status seasonYear
  title { romaji english native }
  synonyms
  coverImage { large medium }
  averageScore popularity
`;

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await httpPostJson<{ data?: T; errors?: { message: string }[] }>(
    ENDPOINT,
    { query, variables },
    { timeout: 20000, retries: 1 }
  );
  if (res.data?.errors && res.data.errors.length && !res.data.data) {
    throw new Error(res.data.errors[0].message || 'AniList mengembalikan galat.');
  }
  return res.data?.data as T;
}

interface GqlMediaBrief {
  id: number;
  format?: string | null;
  episodes?: number | null;
  status?: string | null;
  seasonYear?: number | null;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[] | null;
  coverImage?: { large?: string | null; medium?: string | null };
  averageScore?: number | null;
  popularity?: number | null;
}

function brief(b: GqlMediaBrief): MetaAnimeBrief {
  return {
    id: b.id,
    source: 'anilist',
    title: b.title.english || b.title.romaji || String(b.id),
    cover: b.coverImage?.large || b.coverImage?.medium || '',
    score: b.averageScore != null ? b.averageScore / 10 : undefined,
    format: b.format || undefined,
    episodes: b.episodes || undefined,
    year: b.seasonYear || undefined
  };
}

/** Cari judul di AniList (urut relevan). */
export async function anilistSearch(query: string, perPage = 12): Promise<MetaAnimeBrief[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await cached(
    'meta:al:search:' + q.toLowerCase() + ':' + perPage,
    TTL.brief,
    async () => {
      const r = await gql<{ Page?: { media?: GqlMediaBrief[] } }>(
        `query ($search: String, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${BRIEF_FIELDS} }
          }
        }`,
        { search: q, perPage }
      );
      return r.Page?.media || [];
    }
  );
  return data.map(brief);
}

/** Anime sedang trending — dipakai baris beranda. */
export async function anilistTrending(perPage = 14): Promise<MetaAnimeBrief[]> {
  const data = await cached('meta:al:trending:' + perPage, TTL.brief, async () => {
    const r = await gql<{ Page?: { media?: GqlMediaBrief[] } }>(
      `query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, sort: TRENDING_DESC) { ${BRIEF_FIELDS} }
        }
      }`,
      { perPage }
    );
    return r.Page?.media || [];
  });
  return data.map(brief);
}

interface GqlMediaFull extends GqlMediaBrief {
  duration?: number | null;
  season?: string | null;
  bannerImage?: string | null;
  description?: string | null;
  genres?: string[] | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  studios?: { nodes?: MetaStudio[] } | null;
  relations?: {
    edges?: {
      relationType?: string;
      node?: { id?: number; type?: string; format?: string; status?: string; title?: { romaji?: string }; coverImage?: { large?: string } };
    }[];
  } | null;
  recommendations?: {
    nodes?: { mediaRecommendation?: { id: number; title: { romaji?: string; english?: string }; coverImage?: { large?: string }; averageScore?: number; format?: string; episodes?: number } | null }[];
  } | null;
  characters?: {
    edges?: { role?: string; node?: { name?: { full?: string }; image?: { large?: string } } }[];
  } | null;
}

/** Detail metadata lengkap by AniList ID. */
export async function anilistById(id: number): Promise<AnimeMeta> {
  const m = await cached('meta:al:id:' + id, TTL.full, async () => {
    const r = await gql<{ Media?: GqlMediaFull }>(
      `query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${BRIEF_FIELDS}
          duration season bannerImage description(asHtml: false) genres
          startDate { year month day }
          studios(isMain: true) { nodes { id name } }
          relations { edges { relationType node { ... on Media { id type format status title { romaji } coverImage { large } } } } }
          recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { id title { romaji english } coverImage { large } averageScore format episodes } } }
          characters(perPage: 12, sort: [ROLE, RELEVANCE]) { edges { role node { name { full } image { large } } } }
        }
      }`,
      { id }
    );
    if (!r.Media) throw new Error('Anime tidak ditemukan di AniList.');
    return r.Media;
  });

  const relations: MetaRelation[] = (m.relations?.edges || [])
    .filter(e => e.node && e.node.id)
    .map(e => ({
      id: e.node!.id!,
      source: 'anilist',
      type: String(e.node!.type || 'ANIME'),
      format: e.node!.format || undefined,
      title: e.node!.title?.romaji || String(e.node!.id),
      cover: e.node!.coverImage?.large || '',
      relationType: String(e.relationType || ''),
      status: e.node!.status || undefined
    }));

  const recommendations: MetaAnimeBrief[] = (m.recommendations?.nodes || [])
    .map(n => n.mediaRecommendation)
    .filter((x): x is NonNullable<typeof x> => !!x && !!x.id)
    .map(x => ({
      id: x.id,
      source: 'anilist' as const,
      title: x.title.english || x.title.romaji || String(x.id),
      cover: x.coverImage?.large || '',
      score: x.averageScore != null ? x.averageScore / 10 : undefined,
      format: x.format || undefined,
      episodes: x.episodes || undefined
    }));

  const characters: MetaCharacter[] = (m.characters?.edges || [])
    .filter(c => c.node?.name?.full)
    .map((c, i) => ({
      id: i,
      name: c.node!.name!.full!,
      role: String(c.role || ''),
      image: c.node!.image?.large || undefined
    }));

  const startDate = m.startDate?.year
    ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, '0')}-${String(m.startDate.day || 1).padStart(2, '0')}`
    : undefined;

  return {
    id: m.id,
    source: 'anilist',
    title: m.title.english || m.title.romaji || String(m.id),
    titleRomaji: m.title.romaji || undefined,
    titleNative: m.title.native || undefined,
    synonyms: (m.synonyms || []).filter(Boolean),
    cover: m.coverImage?.large || m.coverImage?.medium || '',
    banner: m.bannerImage || undefined,
    score: m.averageScore != null ? m.averageScore / 10 : undefined,
    popularity: m.popularity || undefined,
    format: m.format || undefined,
    status: m.status || undefined,
    episodes: m.episodes || undefined,
    duration: m.duration || undefined,
    season: m.season || undefined,
    seasonYear: m.seasonYear || undefined,
    studios: (m.studios?.nodes || []).filter(s => s && s.name),
    genres: (m.genres || []).filter(Boolean),
    synopsis: (m.description || '').replace(/<[^>]+>/g, '').trim() || undefined,
    startDate,
    relations,
    recommendations,
    characters
  };
}
