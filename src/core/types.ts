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
}

export interface Genre { t: string; id: string }

export interface EpisodeItem {
  num: string;
  id: string;
  slug: string;
  date: string;
}

export interface DownloadLink {
  quality: string;
  name: string;
  url: string;
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
}

export interface Stream {
  provider: string;
  title: string;
  playerUrl: string;
  qualities: { title: string; servers: StreamServer[] }[];
  servers: StreamServer[];
  note?: string;
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

export interface ScheduleItem {
  time: string;
  title: string;
  id: string;
  provider: string;
  slug?: string;
  poster?: string;
}

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
  apiBase: { wajik: string; kusonime: string };
}
