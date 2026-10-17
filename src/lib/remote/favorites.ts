import { getClient } from '../supabase';
import type { FavAnime, FavoriteRow } from './types';

function toDomain(row: FavoriteRow): FavAnime {
  return {
    id: row.anime_id,
    title: row.title,
    poster: row.poster,
    score: row.score,
    type: row.type,
    status: row.status,
    addedAt: Number(row.added_at) || 0,
    updatedAt: Number(row.updated_at) || 0
  };
}

/** Favorit (Subscribed Anime) — daftar tontonan yang disimpan pengguna. */
export const favorites = {
  async pull(userId: string): Promise<FavAnime[]> {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('favorites').select('*').eq('user_id', userId);
    if (error || !data) return [];
    return (data as FavoriteRow[]).map(toDomain);
  },

  async upsert(userId: string, item: FavAnime): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const row: FavoriteRow = {
      user_id: userId,
      anime_id: item.id,
      title: item.title,
      poster: item.poster,
      score: item.score,
      type: item.type,
      status: item.status,
      added_at: item.addedAt,
      updated_at: item.updatedAt
    };
    await sb.from('favorites').upsert(row, { onConflict: 'user_id,anime_id' });
  },

  async remove(userId: string, animeId: string): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    await sb.from('favorites').delete().eq('user_id', userId).eq('anime_id', animeId);
  }
};
