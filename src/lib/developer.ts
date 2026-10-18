import { getClient } from './supabase';
import { currentUserId } from '../state/auth';

export const DEVELOPER_EMAIL = 'kusumanata767@gmail.com';
export const DEVELOPER_LEVEL = 9999;

export function isNanimeDeveloper(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === DEVELOPER_EMAIL;
}

export interface DeveloperMessage { id: string; content: string; created_at: string; }

function client() {
  const sb = getClient();
  if (!sb || !currentUserId()) throw new Error('Masuk untuk melihat pesan developer');
  return sb;
}

export async function listDeveloperMessages(): Promise<DeveloperMessage[]> {
  const { data, error } = await client().from('nanime_developer_messages')
    .select('id,content,created_at').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as DeveloperMessage[];
}

export async function sendDeveloperMessage(content: string): Promise<void> {
  const value = content.trim();
  if (!value || value.length > 2000) throw new Error('Pesan harus berisi 1–2000 karakter');
  const uid = currentUserId();
  if (!uid) throw new Error('Masuk kembali untuk mengirim pesan');
  const { error } = await client().from('nanime_developer_messages').insert({ author_id: uid, content: value });
  if (error) throw error;
}
