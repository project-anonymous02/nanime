import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getClient: () => ({ from: mocks.from, rpc: mocks.rpc }), isConfigured: () => true }));
import { leaderboard, listDiscussions } from '../src/lib/community';

function queryChain(result: { data: unknown; error: unknown }) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(async () => result);
  chain.limit = vi.fn(async () => result);
  return chain;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('community data boundaries', () => {
  it('looks up discussion identities through the public-profile RPC and keeps avatar URLs', async () => {
    mocks.from.mockReturnValue(queryChain({ data: [{ id: 'post-1', user_id: 'user-1', title: 'Topik', content: 'Isi', created_at: '2026-01-01', updated_at: '2026-01-01' }], error: null }));
    mocks.rpc.mockResolvedValue({ data: [{ id: 'user-1', username: 'Aiko', avatar_url: 'https://images.test/aiko.jpg', is_developer: false, rank: 'silver' }], error: null });
    const rows = await listDiscussions();
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_profiles', { p_user_ids: ['user-1'] });
    expect(rows[0].profile?.avatar_url).toBe('https://images.test/aiko.jpg');
    expect(rows[0].profile?.rank).toBe('silver');
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('email');
  });

  it('ranks by trusted app usage and does not select watch time or private profile data', async () => {
    const query = queryChain({ data: [{ id: 'user-1', username: 'Aiko', avatar_url: null, is_developer: false, rank: 'bronze', app_usage_seconds: 240 }], error: null });
    mocks.from.mockReturnValue(query);
    const rows = await leaderboard();
    expect(mocks.from).toHaveBeenCalledWith('nanime_leaderboard');
    expect(query.select).toHaveBeenCalledWith('id,username,avatar_url,is_developer,rank,app_usage_seconds');
    expect(query.order).toHaveBeenNthCalledWith(1, 'app_usage_seconds', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(rows[0].app_usage_seconds).toBe(240);
    expect(rows[0]).not.toHaveProperty('watch_seconds');
  });
});
