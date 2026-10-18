import type { Card, Detail, DownloadLink, EpisodeStream, ListResult, ScheduleGroup } from '../core/types';

/**
 * Kontrak setiap provider sumber anime.
 * Setiap provider bertanggung jawab atas parsing HTML miliknya sendiri
 * dan dipakai melalui registry, bukan dipanggil langsung dari view.
 */
export interface AnimeProvider {
  id: string;
  name: string;
  /** true bila provider masih dianggap sehat (diverifikasi saat pengembangan). */
  active: boolean;
  /** true bila provider menyediakan pencarian judul. */
  searchable: boolean;
  /** true bila provider hanya sumber unduhan film (tanpa server streaming). */
  movieOnly?: boolean;
  /** true bila provider hanya menyediakan tautan unduh (tanpa server streaming). */
  downloadOnly?: boolean;
  priority: number;
  desc: string;
  /** Wajib diisi agar kebijakan discovery tidak menebak asal/jenis konten. */
  content: 'anime' | 'donghua' | 'hentai' | 'mixed';

  home(): Promise<{ ongoing: Card[]; completed: Card[]; movie: Card[] }>;
  search(query: string): Promise<Card[]>;
  detail(id: string, slug?: string): Promise<Detail>;
  /** Daftar episode; [] bila provider tidak punya daftar episode (movie). */
  episodes(id: string, slug?: string): Promise<Detail['episodeList']>;
  /** Sumber pemutaran untuk satu episode; lempar NetError bila tidak tersedia. */
  stream(params: {
    animeId?: string;
    animeSlug?: string;
    episodeId: string;
    episodeSlug?: string;
    episode?: string;
  }): Promise<EpisodeStream>;
  /** Resolve server alternatif → URL embed/stream. */
  resolveServer?(serverId: string): Promise<string>;
  /** Tautan unduh per kualitas untuk satu episode/seri (provider unduhan). */
  downloads?(params: {
    animeId?: string;
    animeSlug?: string;
    episodeId?: string;
    episodeSlug?: string;
    episode?: string;
  }): Promise<DownloadLink[]>;
  ongoing?(page?: number): Promise<ListResult>;
  completed?(page?: number): Promise<ListResult>;
  schedule?(): Promise<ScheduleGroup[]>;
  genres?(): Promise<{ genreId: string; title: string }[]>;
}

export interface ProviderHealth {
  id: string;
  ok: boolean;
  message?: string;
  checkedAt: number;
}
