import { getClient } from './supabase';

export interface WatchSession { id: string; watched_seconds: number; }

export async function startWatchSession(animeId: string, episode: string): Promise<WatchSession | null> {
  const sb = getClient();
  if (!sb || !animeId || !episode) return null;
  const { data, error } = await sb.rpc('start_watch_session', { p_anime_id: animeId, p_episode: episode });
  if (error) throw error;
  return (data || null) as WatchSession | null;
}

export async function heartbeatWatchSession(id: string, paused: boolean): Promise<WatchSession | null> {
  const sb = getClient();
  if (!sb || !id) return null;
  const { data, error } = await sb.rpc('record_watch_heartbeat', { p_session_id: id, p_paused: paused });
  if (error) throw error;
  return (data || null) as WatchSession | null;
}

export async function endWatchSession(id: string): Promise<void> {
  const sb = getClient();
  if (!sb || !id) return;
  const { error } = await sb.rpc('end_watch_session', { p_session_id: id });
  if (error) throw error;
}

