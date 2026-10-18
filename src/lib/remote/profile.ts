import { getClient } from '../supabase';
import type { ProfileInfo, ProfileRow } from './types';

async function findProfile(sb: NonNullable<ReturnType<typeof getClient>>, userId: string) {
  const current = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!current.error) return { data: current.data as Record<string, unknown> | null, key: 'id' as const, error: null };
  const legacy = await sb.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (!legacy.error) return { data: legacy.data as Record<string, unknown> | null, key: 'user_id' as const, error: null };
  return { data: null, key: 'id' as const, error: legacy.error };
}

/** Profil pengguna (nama & foto disinkronkan dari Google; tidak bisa diubah manual). */
export const profile = {
  async pull(userId: string): Promise<ProfileInfo | null> {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await findProfile(sb, userId);
    if (error || !data) return null;
    const row = data as unknown as ProfileRow;
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
    // Support both the initial migration's user_id/display_name and the
    // connected id/username schema. Never write trusted rank/activity fields.
    const { data: existing, key, error: lookupError } = await findProfile(sb, userId);
    if (lookupError) throw lookupError;
    const legacySchema = key === 'user_id';
    const nameColumn = legacySchema
      ? ('username' in (existing || {}) ? 'username' : 'display_name')
      : 'username';
    const currentName = String(existing?.[nameColumn] || '').trim();
    const row: Record<string, unknown> = {
      [key]: userId,
      avatar_url: info.avatar || existing?.avatar_url || null
    };
    const name = currentName || String(info.name || '').trim();
    if (name) row[nameColumn] = name;
    const { error } = await sb.from('profiles').upsert(row, { onConflict: key });
    if (error) throw error;
  }
};
