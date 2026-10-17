import { getClient } from '../supabase';
import type { SettingRow, UserSettings } from './types';

const KEY = 'app';

/** Pengaturan aplikasi pengguna (satu baris JSON per pengguna). */
export const settings = {
  async pull(userId: string): Promise<Partial<UserSettings> | null> {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('settings').select('*').eq('user_id', userId).eq('key', KEY).maybeSingle();
    if (error || !data) return null;
    const row = data as SettingRow;
    return (row.value || null) as Partial<UserSettings> | null;
  },

  async push(userId: string, value: UserSettings): Promise<void> {
    const sb = getClient();
    if (!sb) return;
    const row: SettingRow = { user_id: userId, key: KEY, value, updated_at: Date.now() };
    await sb.from('settings').upsert(row, { onConflict: 'user_id,key' });
  }
};
