import { beforeEach, describe, expect, it, vi } from 'vitest';

const getClient = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ getClient }));

import { favorites } from '../src/lib/remote/favorites';
import { history } from '../src/lib/remote/history';

describe('remote library failures', () => {
  beforeEach(() => getClient.mockReset());

  it('does not turn a failed subscription fetch into an empty subscribed list', async () => {
    const failure = new Error('network unavailable');
    const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: null, error: failure }) };
    getClient.mockReturnValue({ from: () => query });
    await expect(favorites.pull('user-1')).rejects.toBe(failure);
  });

  it('paginates subscription pulls with deterministic newest-first ordering', async () => {
    const row = (id: string) => ({ user_id: 'user-1', anime_id: id, title: id, poster: '', score: '', type: '', status: '', added_at: 4, updated_at: 4 });
    const range = vi.fn(async (from: number, _to: number) => ({ data: from === 0 ? Array.from({ length: 500 }, (_, index) => row(`anime-${index}`)) : [row('anime-tail')], error: null }));
    const query = { select: () => query, eq: () => query, order: () => query, range };
    getClient.mockReturnValue({ from: () => query });
    const rows = await favorites.pull('user-1');
    expect(rows).toHaveLength(501);
    expect(range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it('propagates write failures so local-first UI can disclose unsynced changes', async () => {
    const failure = new Error('permission denied');
    getClient.mockReturnValue({ from: () => ({ upsert: async () => ({ error: failure }) }) });
    await expect(favorites.upsert('user-1', { id: 'anime-1', title: 'Anime', poster: '', score: '', type: '', status: '', addedAt: 1, updatedAt: 1 })).rejects.toBe(failure);
    const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: null, error: failure }) };
    getClient.mockReturnValue({ from: () => query });
    await expect(history.pull('user-1')).rejects.toBe(failure);
  });
});
