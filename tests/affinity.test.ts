import { beforeEach, describe, expect, it, vi } from 'vitest';

const getClient = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ getClient }));
vi.mock('../src/state/auth', () => ({ currentUserId: () => 'user-a' }));

import { claimAffinityMission, closeAffinity, proposeAffinity, respondAffinity, setAffinityPrivacy } from '../src/lib/affinity';

describe('Nanime Affinity RPC layer', () => {
  beforeEach(() => getClient.mockReset());

  it('creates proposals through the friendship- and slot-validated server RPC', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'bond-1' }, error: null }));
    getClient.mockReturnValue({ rpc });
    await proposeAffinity('user-b', 'besties', 'Teman nonton anime');
    expect(rpc).toHaveBeenCalledWith('nanime_affinity_propose', { p_partner_id: 'user-b', p_tier: 'besties', p_message: 'Teman nonton anime' });
  });

  it('routes responses, cancellation and breakage through the same secure RPC contract', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    getClient.mockReturnValue({ rpc });
    await respondAffinity('bond-1', 'accept');
    await closeAffinity('bond-2', 'cancel');
    await closeAffinity('bond-3', 'break');
    expect(rpc.mock.calls).toEqual([
      ['nanime_affinity_respond', { p_bond_id: 'bond-1', p_action: 'accept' }],
      ['nanime_affinity_close', { p_bond_id: 'bond-2', p_action: 'cancel' }],
      ['nanime_affinity_close', { p_bond_id: 'bond-3', p_action: 'break' }]
    ]);
  });

  it('requires the server to verify mission evidence before claiming XP', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('mission_condition_not_met') }));
    getClient.mockReturnValue({ rpc });
    await expect(claimAffinityMission('bond-1', 'watch_episode')).rejects.toThrow('mission_condition_not_met');
    expect(rpc).toHaveBeenCalledWith('nanime_affinity_claim_mission', { p_bond_id: 'bond-1', p_mission_id: 'watch_episode' });
  });

  it('saves profile visibility through the server privacy endpoint', async () => {
    const rpc = vi.fn(async () => ({ data: 'private', error: null }));
    getClient.mockReturnValue({ rpc });
    await setAffinityPrivacy('private');
    expect(rpc).toHaveBeenCalledWith('nanime_affinity_set_privacy', { p_visibility: 'private' });
  });
});
