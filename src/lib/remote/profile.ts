import { getClient } from '../supabase';
import type { ProfileInfo, ProfileRow } from './types';

/** Profil pengguna (nama & foto disinkronkan dari Google; tidak bisa diubah manual). */
export const profile = {
  async pull(userId: string): Promise<ProfileInfo | null> {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as ProfileRow;
    return {
      userId: row.user_id,
      email: row.email,
      name: row.display_name,
      avatar: row.avatar_url,
      updatedAt: Number(row.updated_at) || 0
    };
  },

  async upsert(userId: string, info: { email: string | null; name: string | null; avatar: string | null }): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const row: ProfileRow = {
      user_id: userId,
      email: info.email,
      display_name: info.name,
      avatar_url: info.avatar,
      updated_at: Date.now()
    };
    await sb.from('profiles').upsert(row, { onConflict: 'user_id' });
  }
};
