import { getClient } from './supabase';
import { currentUserId } from '../state/auth';
import { rankFor, type RankTier } from './rank';

export interface CommunityProfile { id: string; username: string; avatar_url: string | null; is_developer: boolean; watch_seconds: number; rank: RankTier; }
export interface CommentRow { id: string; user_id: string; anime_id: string; content: string; created_at: string; updated_at: string; profile?: CommunityProfile; }
export interface DiscussionRow { id: string; user_id: string; title: string; content: string; created_at: string; updated_at: string; profile?: CommunityProfile; replies?: ReplyRow[]; }
export interface ReplyRow { id: string; discussion_id: string; user_id: string; content: string; created_at: string; profile?: CommunityProfile; }

async function profiles(ids: string[]): Promise<Map<string, CommunityProfile>> {
  const sb = getClient(); const out = new Map<string, CommunityProfile>(); if (!sb || !ids.length) return out;
  // `rank` is a PostgreSQL ordered-set function name and PostgREST treats an
  // explicit select of it as an aggregate expression. Compute the display tier
  // from the trusted seconds/developer columns instead.
  const { data, error } = await sb.from('profiles').select('id,username,avatar_url,is_developer,watch_seconds').in('id', [...new Set(ids)]);
  if (error) throw error;
  for (const p of (data || []) as any[]) { const seconds = Number(p.watch_seconds) || 0; out.set(p.id, { id: p.id, username: p.username || p.display_name || 'Pengguna', avatar_url: p.avatar_url || null, is_developer: !!p.is_developer, watch_seconds: seconds, rank: rankFor(seconds, !!p.is_developer) }); }
  return out;
}
export async function listComments(animeId: string, page = 0): Promise<CommentRow[]> { const sb = getClient(); if (!sb) return []; const { data, error } = await sb.from('anime_comments').select('*').eq('anime_id', animeId).order('created_at', { ascending: false }).range(page * 20, page * 20 + 19); if (error) throw error; const rows = (data || []) as CommentRow[]; const ps = await profiles(rows.map(x => x.user_id)); return rows.map(x => ({ ...x, profile: ps.get(x.user_id) })); }
export async function saveComment(animeId: string, content: string, id?: string): Promise<void> { const sb = getClient(); const uid = currentUserId(); if (!sb || !uid) throw new Error('Login diperlukan'); const text = content.trim(); if (text.length < 1 || text.length > 2000) throw new Error('Komentar harus 1–2000 karakter'); const q = id ? sb.from('anime_comments').update({ content: text, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', uid) : sb.from('anime_comments').insert({ user_id: uid, anime_id: animeId, content: text }); const { error } = await q; if (error) throw error; }
export async function removeComment(id: string): Promise<void> { const sb = getClient(); const uid = currentUserId(); if (!sb || !uid) throw new Error('Login diperlukan'); const { error } = await sb.from('anime_comments').delete().eq('id', id).eq('user_id', uid); if (error) throw error; }
export async function listDiscussions(): Promise<DiscussionRow[]> { const sb = getClient(); if (!sb) return []; const { data, error } = await sb.from('public_discussions').select('*').order('created_at', { ascending: false }).range(0, 49); if (error) throw error; const rows = (data || []) as DiscussionRow[]; const ps = await profiles(rows.map(x => x.user_id)); return rows.map(x => ({ ...x, profile: ps.get(x.user_id) })); }
export async function createDiscussion(title: string, content: string): Promise<void> { const sb = getClient(); const uid = currentUserId(); if (!sb || !uid) throw new Error('Login diperlukan'); if (title.trim().length < 1 || title.trim().length > 160 || content.trim().length < 1 || content.trim().length > 5000) throw new Error('Judul/isi tidak valid'); const { error } = await sb.from('public_discussions').insert({ user_id: uid, title: title.trim(), content: content.trim() }); if (error) throw error; }
export async function listReplies(discussionId: string): Promise<ReplyRow[]> { const sb = getClient(); if (!sb) return []; const { data, error } = await sb.from('discussion_replies').select('*').eq('discussion_id', discussionId).order('created_at'); if (error) throw error; const rows = (data || []) as ReplyRow[]; const ps = await profiles(rows.map(x => x.user_id)); return rows.map(x => ({ ...x, profile: ps.get(x.user_id) })); }
export async function createReply(discussionId: string, content: string): Promise<void> { const sb = getClient(); const uid = currentUserId(); if (!sb || !uid) throw new Error('Login diperlukan'); const text = content.trim(); if (!text || text.length > 2000) throw new Error('Balasan tidak valid'); const { error } = await sb.from('discussion_replies').insert({ discussion_id: discussionId, user_id: uid, content: text }); if (error) throw error; }
export async function leaderboard(): Promise<CommunityProfile[]> { const sb = getClient(); if (!sb) return []; const { data, error } = await sb.from('nanime_leaderboard').select('*').order('watch_seconds', { ascending: false }).limit(100); if (error) throw error; return ((data || []) as any[]).map(p => ({ id: p.id, username: p.username || 'Pengguna', avatar_url: p.avatar_url || null, is_developer: !!p.is_developer, watch_seconds: Number(p.watch_seconds) || 0, rank: rankFor(Number(p.watch_seconds) || 0, !!p.is_developer) })); }

export function formatWatchDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} jam ${minutes} menit ${seconds % 60} detik`;
}
