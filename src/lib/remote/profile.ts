import { getClient } from '../supabase';
import type { ProfileInfo, ProfileRow } from './types';

/** Profil pengguna (nama & foto disinkronkan dari Google; tidak bisa diubah manual). */
export const profile = {
  async pull(userId: string): Promise<ProfileInfo | null> {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const row = data as ProfileRow;
    return {
      userId: (row as any).id || row.user_id,
      email: (row as any).email || null,
      name: (row as any).display_name || (row as any).username || null,
      avatar: row.avatar_url,
      updatedAt: Number(row.updated_at) || 0
    };
  },

  async upsert(userId: string, info: { email: string | null; name: string | null; avatar: string | null }): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    // The connected project uses `id`/`username`; keep this write compatible
    // with that schema and never allow client supplied rank fields.
    const { data: existing } = await sb.from('profiles').select('username,avatar_url').eq('id', userId).maybeSingle();
    const username = String((existing as any)?.username || info.name || '').trim();
    const row: Record<string, unknown> = { id: userId, avatar_url: info.avatar || (existing as any)?.avatar_url || null };
    if (username) row.username = username;
    await sb.from('profiles').upsert(row, { onConflict: 'id' });
  }
};
