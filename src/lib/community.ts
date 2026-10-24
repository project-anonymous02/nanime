import { getClient } from './supabase';
import { currentUserId } from '../state/auth';
import { rankFor, type RankTier } from './rank';

export interface CommunityProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  is_developer: boolean;
  app_usage_seconds: number;
  rank: RankTier;
}

function normalizeRow(row: any): CommunityProfile {
  const seconds = Number(row.app_usage_seconds) || 0;
  const developer = !!row.is_developer;
  return {
    id: row.id,
    username: row.username || 'Pengguna Nanime',
    avatar_url: row.avatar_url || null,
    is_developer: developer,
    app_usage_seconds: seconds,
    rank: rankFor(seconds, developer)
  };
}

async function profiles(ids: string[]): Promise<Map<string, CommunityProfile>> {
  const sb = getClient();
  const out = new Map<string, CommunityProfile>();
  if (!sb || !ids.length) return out;
  // RPC hanya mengembalikan field publik, RLS menjaga kolom sensitif tetap privat.
  const { data, error } = await sb.rpc('get_public_profiles', { p_user_ids: [...new Set(ids)] });
  if (error) return out;
  for (const p of (data || []) as any[]) out.set(p.id, normalizeRow(p));
  return out;
}

export async function getPublicProfiles(ids: string[]): Promise<Map<string, CommunityProfile>> {
  return profiles(ids);
}

/** Leaderboard nyata dari snapshot usage: urutan stabil (detik desc, id asc). */
export async function leaderboard(limit = 50): Promise<CommunityProfile[]> {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('nanime_leaderboard')
    .select('id,username,avatar_url,is_developer,app_usage_seconds')
    .order('app_usage_seconds', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data || []) as any[];
  const live = await profiles(rows.map(row => row.id));
  return rows.map(p => {
    const current = live.get(p.id);
    return normalizeRow({ ...p, username: current?.username || p.username, avatar_url: current?.avatar_url || p.avatar_url, is_developer: current?.is_developer ?? !!p.is_developer });
  });
}

/** Total penggunaan milik sendiri (dibaca langsung dari snapshot). */
export async function ownAppUsageSeconds(): Promise<number> {
  const sb = getClient();
  const userId = currentUserId();
  if (!sb || !userId) return 0;
  const { data, error } = await sb.from('nanime_leaderboard').select('app_usage_seconds').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Number((data as { app_usage_seconds?: number } | null)?.app_usage_seconds) || 0;
}
