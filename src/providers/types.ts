import type { Card, Detail, EpisodeStream, ListResult, ScheduleGroup } from '../core/types';

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
  priority: number;
  desc: string;
  /** Jenis konten: donghua ditandai agar bisa difilter pengguna. */
  content?: 'anime' | 'donghua';

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
