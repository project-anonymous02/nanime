import { beforeEach, describe, expect, it, vi } from 'vitest';

const getClient = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ getClient }));
vi.mock('../src/state/auth', () => ({ currentUserId: () => 'user-1' }));

import { donateClanTreasury, spinClanColors } from '../src/lib/games';

describe('Nanime clan color gacha API', () => {
  beforeEach(() => getClient.mockReset());

  it('sends the selected pull count to the server and returns its authoritative result', async () => {
    const result = { pullType: 'ten', cost: 220, treasuryBalanceAfter: 30, essenceGained: 2, essenceBalanceAfter: 7, pity: { rare: 0, epic: 1, legendary: 1, mythic: 1 }, items: [] };
    const rpc = vi.fn(async () => ({ data: result, error: null }));
    getClient.mockReturnValue({ rpc });
    await expect(spinClanColors('clan-1', 10)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith('nanime_spin_clan_color', { p_clan_id: 'clan-1', p_count: 10 });
  });

  it('surfaces treasury and server validation errors instead of fabricating a pull', async () => {
    const failure = new Error('insufficient_clan_treasury');
    const rpc = vi.fn(async () => ({ data: null, error: failure }));
    getClient.mockReturnValue({ rpc });
    await expect(spinClanColors('clan-1', 1)).rejects.toBe(failure);
  });

  it('donates the requested amount through the atomic treasury RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 15, error: null }));
    getClient.mockReturnValue({ rpc });
    await expect(donateClanTreasury('clan-1', 5)).resolves.toBe(15);
    expect(rpc).toHaveBeenCalledWith('nanime_donate_clan_treasury', { p_clan_id: 'clan-1', p_amount: 5 });
  });
});
