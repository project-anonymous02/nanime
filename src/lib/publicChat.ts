import type { RankTier } from './rank';
import { currentUserId } from '../state/auth';
import { getClient } from './supabase';

export interface PublicChatChannel { id: string; slug: string; name: string; sort_order: number; }
export interface PublicChatProfile { id: string; username: string; avatar_url: string | null; rank: RankTier; is_developer: boolean; }
export interface PublicChatMessage {
  id: string; channel_id: string; user_id: string; content: string; reply_to_id: string | null; created_at: string; profile?: PublicChatProfile;
}

function client() {
  const sb = getClient();
  if (!sb) throw new Error('Supabase Nanime belum dikonfigurasi');
  if (!currentUserId()) throw new Error('Masuk untuk membuka chat publik');
  return sb;
}

export async function listPublicChatChannels(): Promise<PublicChatChannel[]> {
  const { data, error } = await client().from('nanime_public_chat_channels')
    .select('id,slug,name,sort_order').order('sort_order').order('name');
  if (error) throw error;
  return (data || []) as PublicChatChannel[];
}

export async function listPublicChatMessages(channelId: string, limit = 100): Promise<PublicChatMessage[]> {
  const sb = client();
  const { data, error } = await sb.from('nanime_public_chat_messages')
    .select('id,channel_id,user_id,content,reply_to_id,created_at')
    .eq('channel_id', channelId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;
  const rows = ((data || []) as PublicChatMessage[]).reverse();
  const ids = [...new Set(rows.map(row => row.user_id))];
  const people = new Map<string, PublicChatProfile>();
  if (ids.length) {
    const result = await sb.rpc('get_public_profiles', { p_user_ids: ids });
    if (!result.error) for (const row of (result.data || []) as PublicChatProfile[]) {
      const developer = Boolean(row.is_developer);
      const validRank = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'developer'].includes(row.rank) ? row.rank : 'bronze';
      people.set(row.id, {
        id: row.id,
        username: row.username || 'Pengguna Nanime',
        avatar_url: row.avatar_url || null,
        is_developer: developer,
        rank: developer ? 'developer' : validRank as RankTier
      });
    }
  }
  return rows.map(row => ({ ...row, profile: people.get(row.user_id) }));
}

export async function sendPublicChatMessage(channelId: string, content: string, replyToId?: string): Promise<void> {
  const value = content.trim();
  if (!value || value.length > 2000) throw new Error('Pesan harus berisi 1–2000 karakter');
  const uid = currentUserId();
  if (!uid) throw new Error('Masuk kembali untuk mengirim pesan');
  const { error } = await client().from('nanime_public_chat_messages').insert({
    channel_id: channelId, user_id: uid, content: value, ...(replyToId ? { reply_to_id: replyToId } : {})
  });
  if (error) throw error;
}

export async function deletePublicChatMessage(id: string): Promise<void> {
  const uid = currentUserId();
  if (!uid) throw new Error('Masuk kembali untuk menghapus pesan');
  const { error } = await client().from('nanime_public_chat_messages').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
}
