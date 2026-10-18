import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('../src/state/auth', () => ({ currentUserId: () => 'user-1' }));
import { listPublicChatChannels, listPublicChatMessages, sendPublicChatMessage } from '../src/lib/publicChat';

function chain(result: { data: unknown; error: unknown }) {
  const value: any = {};
  for (const method of ['select', 'eq', 'order', 'limit']) value[method] = vi.fn(() => value);
  value.insert = vi.fn(async () => result);
  value.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('public chat data', () => {
  it('loads configured channels without inventing channels in the client', async () => {
    const query = chain({ data: [{ id: 'channel-1', slug: 'umum', name: 'Umum', sort_order: 0 }], error: null });
    mocks.from.mockReturnValue(query);
    expect(await listPublicChatChannels()).toEqual([{ id: 'channel-1', slug: 'umum', name: 'Umum', sort_order: 0 }]);
    expect(mocks.from).toHaveBeenCalledWith('nanime_public_chat_channels');
  });

  it('orders recent messages chronologically and attaches only public profile fields', async () => {
    const query = chain({ data: [
      { id: 'm2', channel_id: 'c1', user_id: 'user-2', content: 'B', reply_to_id: null, created_at: '2026-01-02' },
      { id: 'm1', channel_id: 'c1', user_id: 'user-1', content: 'A', reply_to_id: null, created_at: '2026-01-01' }
    ], error: null });
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockResolvedValue({ data: [{ id: 'user-1', username: 'Aiko', avatar_url: 'https://img.test/a.png', is_developer: true, rank: 'developer', email: 'private@example.test' }], error: null });
    const rows = await listPublicChatMessages('c1', 20);
    expect(rows.map(row => row.id)).toEqual(['m1', 'm2']);
    expect(rows[0].profile?.username).toBe('Aiko');
    expect(rows[0].profile?.rank).toBe('developer');
    expect(rows[0].profile).not.toHaveProperty('email');
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_profiles', { p_user_ids: ['user-1', 'user-2'] });
  });

  it('validates outbound text and sends under the current Supabase user', async () => {
    const query = chain({ data: null, error: null });
    mocks.from.mockReturnValue(query);
    await expect(sendPublicChatMessage('c1', '  halo  ', 'parent-1')).resolves.toBeUndefined();
    expect(query.insert).toHaveBeenCalledWith({ channel_id: 'c1', user_id: 'user-1', content: 'halo', reply_to_id: 'parent-1' });
    await expect(sendPublicChatMessage('c1', '  ')).rejects.toThrow('1–2000 karakter');
  });
});
