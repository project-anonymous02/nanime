import { getClient } from '../supabase';
import type { HistoryItem, HistoryRow } from './types';

function toDomain(row: HistoryRow): HistoryItem {
  return {
    animeId: row.anime_id,
    episode: row.episode,
    title: row.title,
    poster: row.poster,
    positionSec: Number(row.position_sec) || 0,
    durationSec: Number(row.duration_sec) || 0,
    percent: Number(row.percent) || 0,
    completed: !!row.completed,
    watchedAt: Number(row.watched_at) || 0,
    updatedAt: Number(row.updated_at) || 0
  };
}

/** Riwayat menonton + progress detik (kunci: anime + episode). */
export const history = {
  async pull(userId: string): Promise<HistoryItem[]> {
    const sb = getClient();
    if (!sb) return [];
    const rows: HistoryRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await sb.from('history').select('*').eq('user_id', userId).order('watched_at', { ascending: false }).order('anime_id', { ascending: true }).order('episode', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as HistoryRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.map(toDomain);
  },

  async upsert(userId: string, item: HistoryItem): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const row: HistoryRow = {
      user_id: userId,
      anime_id: item.animeId,
      episode: item.episode,
      title: item.title,
      poster: item.poster,
      position_sec: Math.max(0, Math.round(item.positionSec) || 0),
      duration_sec: Math.max(0, Math.round(item.durationSec) || 0),
      percent: Math.max(0, Math.min(100, item.percent || 0)),
      completed: !!item.completed,
      watched_at: item.watchedAt,
      updated_at: item.updatedAt
    };
    const { error } = await sb.from('history').upsert(row, { onConflict: 'user_id,anime_id,episode' });
    if (error) throw error;
  },

  async remove(userId: string, animeId: string, episode: string): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.from('history').delete().eq('user_id', userId).eq('anime_id', animeId).eq('episode', episode);
    if (error) throw error;
  },

  async clear(userId: string): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.from('history').delete().eq('user_id', userId);
    if (error) throw error;
  }
};
