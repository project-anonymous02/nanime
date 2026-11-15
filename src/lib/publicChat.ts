import type { RankTier } from './rank';
import { rankFor } from './rank';
import { currentUserId } from '../state/auth';
import { getClient } from './supabase';

export interface PublicChatChannel { id: string; slug: string; name: string; sort_order: number; }
export interface PublicChatProfile { id: string; username: string; avatar_url: string | null; rank: RankTier; is_developer: boolean; app_usage_seconds?: number; }

/**
 * Konteks pesan yang dibalas. `available`=false bila pesan induk sudah
 * hilang (dihapus → `reply_to_id` jadi NULL) atau tidak ada di kanal yang
 * sama, sehingga UI menampilkan "Pesan tidak tersedia" alih-alih kutipan
 * dari pesan yang salah.
 */
export interface PublicChatReplyRef {
  id: string;
  author: string;
  preview: string;
  available: boolean;
}

export interface PublicChatMessage {
  id: string; channel_id: string; user_id: string; content: string; reply_to_id: string | null; created_at: string;
  profile?: PublicChatProfile;
  /** Konteks balasan (isi + pengirim) bila pesan ini adalah balasan. */
  reply?: PublicChatReplyRef | null;
}

/** Panjang pratinjau kutipan di dalam gelembung pesan. */
const REPLY_PREVIEW_MAX = 90;

/** Ringkas teks untuk kutipan: whitespace diratakan lalu dipotong. */
export function replyPreviewText(content: string): string {
  const flat = String(content || '').replace(/\s+/g, ' ').trim();
  if (!flat) return 'Pesan kosong';
  if (flat.length <= REPLY_PREVIEW_MAX) return flat;
  return flat.slice(0, REPLY_PREVIEW_MAX).trimEnd() + '…';
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

interface ParentRow { id: string; user_id: string; content: string; channel_id: string; }

export async function listPublicChatMessages(channelId: string, limit = 100): Promise<PublicChatMessage[]> {
  const sb = client();
  const { data, error } = await sb.from('nanime_public_chat_messages')
    .select('id,channel_id,user_id,content,reply_to_id,created_at')
    .eq('channel_id', channelId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;
  const rows = ((data || []) as PublicChatMessage[]).reverse();

  /* Pesan induk bisa saja berada di luar halaman ini (balasan ke pesan lama)
     atau sudah dihapus. Ambil kutipannya lewat query terpisah supaya
     konteks balasan tetap tampil dan tidak pernah salah pesan. */
  const parentIds = [...new Set(rows.map(row => row.reply_to_id).filter((id): id is string => !!id))];
  const parents = new Map<string, ParentRow>();
  if (parentIds.length) {
    const { data: parentRows, error: parentError } = await sb.from('nanime_public_chat_messages')
      .select('id,user_id,content,channel_id').in('id', parentIds);
    if (parentError) throw parentError;
    for (const parent of (parentRows || []) as ParentRow[]) parents.set(parent.id, parent);
  }

  const ids = [
    ...new Set([
      ...rows.map(row => row.user_id),
      ...[...parents.values()].map(parent => parent.user_id),
    ]),
  ];
  const people = new Map<string, PublicChatProfile>();
  if (ids.length) {
    const result = await sb.rpc('get_public_profiles', { p_user_ids: ids });
    if (result.error) throw result.error;
    for (const row of (result.data || []) as PublicChatProfile[]) {
      const developer = Boolean(row.is_developer);
      const rank = rankFor(Number(row.app_usage_seconds) || 0, developer);
      people.set(row.id, {
        id: row.id,
        username: row.username || 'Pengguna Nanime',
        avatar_url: row.avatar_url || null,
        is_developer: developer,
        rank
      });
    }
  }
  return rows.map(row => ({ ...row, profile: people.get(row.user_id), reply: buildReplyRef(row, parents, people) }));
}

/** Susun konteks balasan: pengirim + cuplikan isi pesan induk. */
function buildReplyRef(
  row: PublicChatMessage,
  parents: Map<string, ParentRow>,
  people: Map<string, PublicChatProfile>
): PublicChatReplyRef | null {
  if (!row.reply_to_id) return null;
  const parent = parents.get(row.reply_to_id);
  /* Pesan induk harus ada DAN di kanal yang sama — kebijakan insert di DB
     sudah menjamin ini, tapi kita tidak boleh menampilkan kutipan dari
     kanal/pesan yang tidak boleh dilihat pengguna. */
  if (!parent || parent.channel_id !== row.channel_id) {
    return { id: row.reply_to_id, author: 'Pengguna Nanime', preview: 'Pesan tidak tersedia', available: false };
  }
  const author = people.get(parent.user_id);
  return {
    id: parent.id,
    author: author?.username || 'Pengguna Nanime',
    preview: replyPreviewText(parent.content),
    available: true
  };
}

export async function sendPublicChatMessage(channelId: string, content: string, replyToId?: string | null): Promise<void> {
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
