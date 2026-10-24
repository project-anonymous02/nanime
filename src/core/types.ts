/** Tipe domain bersama untuk seluruh lapisan aplikasi. */

export interface Card {
  id: string;
  provider: string;
  title: string;
  poster: string;
  score: string;
  type: string;
  status: string;
  epLabel: string;
  sub: string;
  sourceUrl: string;
  slug?: string;
  match?: number;
  /** Jumlah views (string mentah dari sumber) bila tersedia. */
  views?: string;
  /** Classification when a provider exposes verified content metadata. */
  genres?: string[];
  tags?: string[];
  contentRating?: string;
  classification?: string;
  /** Alternate provider titles (English, romaji, or original-language titles). */
  altTitles?: string[];
  /** Known broadcast year and official identifiers, when explicitly supplied. */
  year?: string;
  externalIds?: Record<string, string>;
}

export interface Genre {
  t: string;
  id: string;
}

export interface EpisodeItem {
  num: string;
  id: string;
  slug: string;
  date: string;
  title?: string;
}

export interface DownloadLink {
  quality: string;
  name: string;
  url: string;
  /** Scraped page links are not assumed to be reachable media files. */
  availability?: 'unverified' | 'verified';
}

export interface Detail {
  id: string;
  slug: string;
  provider: string;
  title: string;
  alt: string;
  poster: string;
  score: string;
  type: string;
  status: string;
  year: string;
  episodes: string;
  duration: string;
  studio: string;
  genres: Genre[];
  synopsis: string;
  downloads: DownloadLink[];
  batchId?: string;
  episodeList: EpisodeItem[];
  recommendations: Card[];
}

export interface StreamServer {
  name: string;
  id: string;
  quality?: string;
  def?: boolean;
}

export interface Stream {
  provider: string;
  title: string;
  playerUrl: string;
  /** Identifies a media file vs an iframe or opaque provider server token. */
  sourceKind?: 'direct-media' | 'embed-page' | 'provider-resolver';
  qualities: { title: string; servers: StreamServer[] }[];
  servers: StreamServer[];
  note?: string;
}

export interface EpisodeStream extends Stream {
  downloads: DownloadLink[];
  info: unknown;
}

export interface SourceResult {
  id: string;
  ok: boolean;
  count: number;
  items: Card[];
  error?: string;
}

export interface SearchResult {
  items: Card[];
  sources: SourceResult[];
}

export interface Pagination {
  currentPage?: number;
  hasNextPage?: boolean;
  nextPage?: number | null;
  totalPages?: number;
}

export interface ListResult {
  list: Card[];
  pagination: Pagination | null;
  catalog?: boolean;
}

export interface ScheduleItem {
  time: string;
  episode?: string;
  title: string;
  id: string;
  provider: string;
  slug?: string;
  poster?: string;
  genres?: string[];
  tags?: string[];
  contentRating?: string;
  classification?: string;
}

export interface ScheduleGroup {
  day: string;
  items: ScheduleItem[];
}

/* ── Tipe metadata (AniList/Kitsu) ── */

export interface MetaRelation {
  id: number;
  source: 'anilist' | 'kitsu';
  type: string;
  format?: string;
  title: string;
  cover?: string;
  relationType: string;
  status?: string;
}

export interface MetaCharacter {
  id: number;
  name: string;
  role: string;
  image?: string;
}

export interface MetaStudio {
  id: number;
  name: string;
}

/** Metadata katalog dari penyedia publik (AniList primer, Kitsu fallback). */
export interface AnimeMeta {
  id: number;
  source: 'anilist' | 'kitsu';
  title: string;
  titleRomaji?: string;
  titleNative?: string;
  synonyms: string[];
  cover?: string;
  banner?: string;
  score?: number;
  popularity?: number;
  format?: string;
  status?: string;
  episodes?: number;
  duration?: number;
  season?: string;
  seasonYear?: number;
  studios: MetaStudio[];
  genres: string[];
  synopsis?: string;
  startDate?: string;
  relations: MetaRelation[];
  recommendations: MetaAnimeBrief[];
  characters: MetaCharacter[];
}

export interface MetaAnimeBrief {
  id: number;
  source: 'anilist' | 'kitsu';
  title: string;
  cover?: string;
  score?: number;
  format?: string;
  episodes?: number;
  year?: number;
}

/* ── Data pengguna (repository lokal, siap sinkron) ── */

export type WatchStatus = 'ptw' | 'watching' | 'completed' | 'dropped';

export interface FavItem {
  id: string;
  title: string;
  cover: string;
  provider: string;
  score: string;
  epLabel: string;
  sub: string;
  type: string;
  slug: string;
  t?: number;
}

export interface HistItem {
  id: string;
  slug: string;
  title: string;
  cover: string;
  ep: string;
  provider: string;
  eid: string;
  eslug: string;
  t?: number;
  dur?: number;
  pct?: number;
}

export interface ContinueItem extends HistItem {
  last?: number;
}

/** Preferensi pengguna (localStorage, siap disinkronkan bila backend tersedia). */
export interface Config {
  provider: string;
  autoNext: boolean;
  autoplay: boolean;
  theme: 'dark' | 'light' | 'system';
  accent: string;
  dataSaver: boolean;
  notify: boolean;
  notifyInterval: number;
  defaultQuality: string;
  keepHistory: boolean;
}

export interface UserEntry {
  /** ID stabil: provider:id */
  key: string;
  provider: string;
  animeId: string;
  slug: string;
  title: string;
  poster: string;
  status?: WatchStatus;
  rating?: number;
  favorite: boolean;
  listIds: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProgressEntry {
  key: string;
  provider: string;
  animeId: string;
  slug: string;
  title: string;
  poster: string;
  episode: string;
  episodeId: string;
  episodeSlug: string;
  positionSec: number;
  durationSec: number;
  percent: number;
  completed: boolean;
  updatedAt: number;
}

export interface HistoryEntry {
  key: string;
  provider: string;
  animeId: string;
  slug: string;
  title: string;
  poster: string;
  episode: string;
  episodeId: string;
  episodeSlug: string;
  watchedAt: number;
}

export interface CustomList {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExportBundle {
  app: 'nanime';
  schema: number;
  at: number;
  entries: UserEntry[];
  progress: ProgressEntry[];
  history: HistoryEntry[];
  lists: CustomList[];
  searchHistory: string[];
  seen: Record<string, number>;
  settings: Partial<Config>;
}

export const EXPORT_SCHEMA_VERSION = 3;

/* ════════════════════════════════════════════════════════════════════════
   Tipe kanonik v2 — identitas tunggal lintas sumber.
   Kartu di UI selalu berbentuk AggregatedCard: satu judul = satu kartu,
   walau tersedia di banyak sumber. `canonicalId` menjadi kunci tak terlihat
   yang dipakai pada route /detail/:id.
   ════════════════════════════════════════════════════════════════════════ */

/** Rujukan ke satu sumber penyedia (tidak pernah ditampilkan ke pengguna). */
export interface SourceRef {
  provider: string;
  id: string;
  slug: string;
  sourceUrl?: string;
}

/** Kartu hasil penggabungan lintas sumber. */
export interface AggregatedCard extends Card {
  canonicalId: string;
  sources: SourceRef[];
  providerCount: number;
  /** Skor relevansi 0–1000 (dipakai untuk pengurutan internal). */
  score1000: number;
  /** Peringkat mingguan (1, 2, 3, …) bila kartu dipakai di rail peringkat. */
  rank?: number;
}

export interface AggregatedSearchResult {
  items: AggregatedCard[];
  sources: SourceResult[];
}

/** Label kualitas yang dipaksa selalu tersedia di pemutar. */
export type QualityLabel = '1080p' | '720p' | '480p' | '360p';

export const QUALITY_ORDER: QualityLabel[] = ['1080p', '720p', '480p', '360p'];

export interface QualitySource {
  url: string;
  providerRef: string;
  /** Label asli dari sumber, untuk tab Stream. */
  label: string;
  kind: 'file' | 'embed';
  /** true bila URL memang sumber kualitas ini (bukan pinjaman kualitas terdekat). */
  exact: boolean;
}

export interface ForcedQuality {
  label: QualityLabel;
  source: QualitySource | null;
  /** true bila memakai sumber kualitas terdekat karena kualitas ini tidak eksplisit tersedia. */
  approx: boolean;
}

/** Kandidat sumber internal untuk resolver otomatis; tidak ditampilkan di menu kualitas. */
export interface StreamServerRef {
  ref: string;
  label: string;
  /** URL siap pakai; kosong berarti perlu diresolusi saat dipilih. */
  url: string;
  providerRef: string;
  isDefault?: boolean;
  quality?: QualityLabel;
}

export interface DownloadGroup {
  quality: string;
  items: DownloadLink[];
}

/** Bundle lengkap halaman detail (sudah digabung lintas sumber). */
export interface DetailBundle {
  id: string;
  /** Provider identities used to validate cache results against source policy. */
  providers?: string[];
  title: string;
  alt: string;
  poster: string;
  /** Artwork hero valid dari halaman detail sumber; poster tetap dipertahankan sebagai fallback. */
  heroImage?: string;
  score: string;
  type: string;
  status: string;
  year: string;
  episodes: string;
  duration: string;
  studio: string;
  genres: string[];
  synopsis: string;
  sourceCount: number;
  episodeList: {
    num: string;
    id: string;
    slug: string;
    date: string;
    title?: string;
    sources: { provider: string; id: string; slug: string }[];
  }[];
  recommendations: AggregatedCard[];
  stale?: boolean;
}

/** Bundle halaman pemutar untuk satu episode. */
export interface StreamBundle {
  id: string;
  title: string;
  poster: string;
  episode: string;
  episodeTitle?: string;
  qualities: ForcedQuality[];
  defaultQuality: QualityLabel | null;
  servers: StreamServerRef[];
  downloads: DownloadGroup[];
  synopsis: string;
  sourceCount: number;
  availability: 'direct-media' | 'external-embed' | 'unavailable';
  sourceKind?: 'direct-media' | 'embed-page' | 'provider-resolver';
  unavailableReason?: string;
  nextEpisode?: string;
  stale?: boolean;
}

/** Satu rail beranda siap-render. */
export interface HomeFeed {
  newUpdate: AggregatedCard[];
  weekly: AggregatedCard[];
  completed: AggregatedCard[];
  movie: AggregatedCard[];
  sources: SourceResult[];
  stale: boolean;
}
