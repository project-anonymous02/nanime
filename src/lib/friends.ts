import { getClient } from './supabase';
import { currentUserId } from '../state/auth';

export interface FriendProfile { id: string; username: string; avatar_url: string | null; rank: string; }
export interface FriendRequest { id: string; requester_id: string; recipient_id: string; status: 'pending' | 'accepted' | 'declined'; created_at: string; person: FriendProfile; }
export interface DirectMessage { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: string | null; }

function client() {
  const sb = getClient();
  if (!sb) throw new Error('Layanan akun Nanime belum dikonfigurasi');
  if (!currentUserId()) throw new Error('Masuk untuk menggunakan teman dan chat');
  return sb;
}

async function publicProfiles(ids: string[]): Promise<Map<string, FriendProfile>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await client().rpc('get_public_profiles', { p_user_ids: unique });
  if (error) throw error;
  return new Map(((data || []) as any[]).map(p => [p.id, { id: p.id, username: p.username || 'Pengguna', avatar_url: p.avatar_url || null, rank: p.rank || 'bronze' }]));
}

async function attachPeople(rows: any[], personId: (row: any) => string): Promise<FriendRequest[]> {
  const profiles = await publicProfiles(rows.map(personId));
  return rows.map(row => ({ ...row, person: profiles.get(personId(row)) || { id: personId(row), username: 'Pengguna Nanime', avatar_url: null, rank: 'bronze' } }));
}

export async function searchPeople(query: string): Promise<FriendProfile[]> {
  const value = query.trim();
  if (value.length < 3) return [];
  const { data, error } = await client().rpc('search_nanime_profiles', { p_query: value });
  if (error) throw error;
  return (data || []) as FriendProfile[];
}

export async function listFriendRequests(): Promise<{ friends: FriendRequest[]; incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const sb = client(); const uid = currentUserId()!;
  const { data, error } = await sb.from('nanime_friend_requests').select('id,requester_id,recipient_id,status,created_at').or(`requester_id.eq.${uid},recipient_id.eq.${uid}`).in('status', ['pending', 'accepted']).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  const rows = (data || []) as any[];
  const friends = await attachPeople(rows.filter(row => row.status === 'accepted'), row => row.requester_id === uid ? row.recipient_id : row.requester_id);
  const incoming = await attachPeople(rows.filter(row => row.status === 'pending' && row.recipient_id === uid), row => row.requester_id);
  const outgoing = await attachPeople(rows.filter(row => row.status === 'pending' && row.requester_id === uid), row => row.recipient_id);
  return { friends, incoming, outgoing };
}

export async function sendFriendRequest(userId: string): Promise<void> {
  if (!userId || userId === currentUserId()) throw new Error('Akun teman tidak valid');
  const { error } = await client().from('nanime_friend_requests').insert({ requester_id: currentUserId(), recipient_id: userId, status: 'pending' });
  if (error) throw error;
}

export async function respondFriendRequest(id: string, accepted: boolean): Promise<void> {
  const uid = currentUserId(); const sb = client();
  const { error } = await sb.from('nanime_friend_requests').update({ status: accepted ? 'accepted' : 'declined', updated_at: new Date().toISOString() }).eq('id', id).eq('recipient_id', uid).eq('status', 'pending');
  if (error) throw error;
}

export async function removeFriend(id: string): Promise<void> {
  const { error } = await client().from('nanime_friend_requests').delete().eq('id', id).eq('status', 'accepted');
  if (error) throw error;
}

export async function listMessages(friendId: string, before?: string): Promise<DirectMessage[]> {
  const uid = currentUserId(); const sb = client();
  if (!friendId || friendId === uid) throw new Error('Teman tidak valid');
  let query = sb.from('nanime_direct_messages').select('id,sender_id,recipient_id,content,created_at,read_at').or(`and(sender_id.eq.${uid},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${uid})`).order('created_at', { ascending: false }).limit(60);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  const messages = ((data || []) as DirectMessage[]).reverse();
  const unread = messages.filter(message => message.sender_id === friendId && message.recipient_id === uid && !message.read_at).map(message => message.id);
  if (unread.length) {
    const { error: readError } = await sb.from('nanime_direct_messages').update({ read_at: new Date().toISOString() }).in('id', unread).eq('recipient_id', uid);
    if (readError) throw readError;
  }
  return messages;
}

export async function sendMessage(friendId: string, content: string): Promise<void> {
  const text = content.trim();
  if (!text || text.length > 2000) throw new Error('Pesan harus berisi 1–2000 karakter');
  const { error } = await client().from('nanime_direct_messages').insert({ sender_id: currentUserId(), recipient_id: friendId, content: text });
  if (error) throw error;
}
