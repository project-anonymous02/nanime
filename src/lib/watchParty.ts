import { getClient } from './supabase';
import { currentUserId } from '../state/auth';

export interface WatchParty {
  id: string; invite_code: string; host_id: string; anime_id: string; title: string;
  poster: string | null; episode: string; position_seconds: number; is_playing: boolean;
  updated_at: string; created_at: string;
}
export interface WatchPartyMessage { id: string; party_id: string; user_id: string; content: string; created_at: string; username?: string; avatar_url?: string | null; }
function api() { const client = getClient(); if (!client) throw new Error('Supabase Nanime belum dikonfigurasi'); if (!currentUserId()) throw new Error('Masuk untuk memakai Nobar'); return client; }

export async function createWatchParty(input: Pick<WatchParty, 'anime_id' | 'title' | 'poster' | 'episode'>): Promise<WatchParty> {
  const sb = api(); const uid = currentUserId()!;
  const { data, error } = await sb.from('nanime_watch_parties').insert({ ...input, host_id: uid }).select('*').single();
  if (error) throw error;
  const party = data as WatchParty;
  const { error: memberError } = await sb.from('nanime_watch_party_members').insert({ party_id: party.id, user_id: uid });
  if (memberError) { await sb.from('nanime_watch_parties').delete().eq('id', party.id); throw memberError; }
  return party;
}
export async function joinWatchParty(code: string): Promise<WatchParty> {
  const { data, error } = await api().rpc('join_nanime_watch_party', { p_invite_code: code.trim().toLowerCase() });
  if (error) throw error;
  const party = Array.isArray(data) ? data[0] : data;
  if (!party) throw new Error('Room Nobar tidak ditemukan');
  return party as WatchParty;
}
export async function getWatchParty(id: string): Promise<WatchParty> {
  const { data, error } = await api().from('nanime_watch_parties').select('*').eq('id', id).single();
  if (error) throw error;
  return data as WatchParty;
}
export async function listPartyMessages(id: string): Promise<WatchPartyMessage[]> {
  const sb = api();
  const { data, error } = await sb.from('nanime_watch_party_messages').select('id,party_id,user_id,content,created_at').eq('party_id', id).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  const rows = (data || []) as WatchPartyMessage[];
  const ids = [...new Set(rows.map(row => row.user_id))];
  if (!ids.length) return rows;
  const { data: profiles, error: profileError } = await sb.rpc('get_public_profiles', { p_user_ids: ids });
  if (profileError) throw profileError;
  const people = new Map(((profiles || []) as Array<{ id: string; username: string; avatar_url: string | null }>).map(profile => [profile.id, profile]));
  return rows.map(row => ({ ...row, username: people.get(row.user_id)?.username || 'Pengguna Nanime', avatar_url: people.get(row.user_id)?.avatar_url || null }));
}
export async function sendPartyMessage(id: string, content: string): Promise<void> {
  const value = content.trim();
  if (!value || value.length > 1000) throw new Error('Pesan maksimal 1000 karakter');
  const { error } = await api().from('nanime_watch_party_messages').insert({ party_id: id, user_id: currentUserId(), content: value });
  if (error) throw error;
}
export async function leaveWatchParty(id: string): Promise<void> {
  const { error } = await api().from('nanime_watch_party_members').delete().eq('party_id', id).eq('user_id', currentUserId());
  if (error) throw error;
}
export async function closeWatchParty(id: string): Promise<void> {
  const { error } = await api().from('nanime_watch_parties').delete().eq('id', id).eq('host_id', currentUserId());
  if (error) throw error;
}
export async function updatePartyPlayback(id: string, position: number, playing: boolean): Promise<void> {
  const { error } = await api().from('nanime_watch_parties').update({ position_seconds: Math.max(0, position), is_playing: playing, updated_at: new Date().toISOString() }).eq('id', id).eq('host_id', currentUserId());
  if (error) throw error;
}
/** Host owns episode selection. Reset the shared playhead atomically with the change. */
export async function updatePartyEpisode(id: string, episode: string): Promise<WatchParty> {
  const value = episode.trim();
  if (!value) throw new Error('Pilih episode untuk Nobar');
  const { data, error } = await api().from('nanime_watch_parties')
    .update({ episode: value, position_seconds: 0, is_playing: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('host_id', currentUserId()).select('*').single();
  if (error) throw error;
  return data as WatchParty;
}
