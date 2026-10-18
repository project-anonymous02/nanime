import { getClient } from './supabase';
import { currentUserId } from '../state/auth';
import type { FriendProfile } from './friends';

export type AffinityTier = 'partner' | 'bros' | 'besties' | 'confidants';
export type AffinityStatus = 'pending' | 'active' | 'rejected' | 'cancelled' | 'broken';
export type AffinityPrivacy = 'private' | 'friends' | 'public';
export interface AffinityLevel { level: number; xp_required: number; unlock_title: string; }
export interface AffinityMission { mission_id: string; label: string; xp_reward: number; claimed: boolean; }
export interface AffinityBond {
  id: string; tier: AffinityTier; status: AffinityStatus; proposer_id: string; partner_id: string;
  message: string; xp: number; created_at: string; accepted_at: string | null; closed_at: string | null;
  level?: number;
  person?: FriendProfile;
}
export interface AffinitySummary {
  bonds: AffinityBond[]; tiers: Array<{ tier: AffinityTier; label: string; max_slots: number; used: number }>;
  missions: Array<Omit<AffinityMission, 'claimed'>>; levels: AffinityLevel[]; cooldowns: Array<{ tier: AffinityTier; until_at: string }>;
  privacy: AffinityPrivacy;
}
export interface AffinityLeaderboardRow { bond_id: string; tier: AffinityTier; xp: number; user_a: FriendProfile; user_b: FriendProfile; }

function api() {
  const sb = getClient();
  if (!sb) throw new Error('Layanan Afinitas Nanime belum dikonfigurasi');
  if (!currentUserId()) throw new Error('Masuk untuk menggunakan Afinitas');
  return sb;
}

async function profiles(ids: string[]): Promise<Map<string, FriendProfile>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await api().rpc('get_public_profiles', { p_user_ids: unique });
  if (error) throw error;
  return new Map(((data || []) as Array<FriendProfile & { is_developer?: boolean }>).map(person => [person.id, {
    id: person.id, username: person.username || 'Pengguna Nanime', avatar_url: person.avatar_url || null, rank: person.rank || 'bronze'
  }]));
}

export async function loadAffinity(): Promise<AffinitySummary> {
  const sb = api(); const uid = currentUserId()!;
  const [bondResult, tierResult, missionResult, levelResult, cooldownResult, privacyResult] = await Promise.all([
    sb.from('nanime_affinity_bonds').select('id,tier,status,proposer_id,partner_id,message,xp,created_at,accepted_at,closed_at').or(`proposer_id.eq.${uid},partner_id.eq.${uid}`).order('created_at', { ascending: false }).limit(200),
    sb.from('nanime_affinity_tier_config').select('tier,label,max_slots').eq('active', true).order('max_slots'),
    sb.from('nanime_affinity_missions').select('mission_id,label,xp_reward').eq('active', true).order('xp_reward', { ascending: false }),
    sb.from('nanime_affinity_levels').select('level,xp_required,unlock_title').order('level'),
    sb.from('nanime_affinity_cooldowns').select('tier,until_at').eq('user_id', uid).gt('until_at', new Date().toISOString()),
    sb.from('nanime_affinity_privacy').select('visibility').eq('user_id', uid).maybeSingle()
  ]);
  for (const result of [bondResult, tierResult, missionResult, levelResult, cooldownResult, privacyResult]) if (result.error) throw result.error;
  const rows = (bondResult.data || []) as AffinityBond[];
  const uidSet = new Set([uid]);
  rows.forEach(row => uidSet.add(row.proposer_id === uid ? row.partner_id : row.proposer_id));
  const people = await profiles([...uidSet].filter(id => id !== uid));
  const bonds = rows.map(row => ({ ...row, person: people.get(row.proposer_id === uid ? row.partner_id : row.proposer_id) }));
  const activeByTier = new Map<string, number>();
  for (const bond of bonds) if (bond.status === 'active') activeByTier.set(bond.tier, (activeByTier.get(bond.tier) || 0) + 1);
  return {
    bonds,
    tiers: ((tierResult.data || []) as Array<{ tier: AffinityTier; label: string; max_slots: number }>).map(row => ({ ...row, used: activeByTier.get(row.tier) || 0 })),
    missions: (missionResult.data || []) as Array<Omit<AffinityMission, 'claimed'>>,
    levels: (levelResult.data || []) as AffinityLevel[],
    cooldowns: (cooldownResult.data || []) as Array<{ tier: AffinityTier; until_at: string }>,
    privacy: ((privacyResult.data as { visibility?: AffinityPrivacy } | null)?.visibility || 'friends')
  };
}

export async function loadBondMissions(bondId: string): Promise<AffinityMission[]> {
  const sb = api(); const uid = currentUserId()!; const today = new Date().toISOString().slice(0, 10);
  const [missions, claims] = await Promise.all([
    sb.from('nanime_affinity_missions').select('mission_id,label,xp_reward').eq('active', true).order('xp_reward', { ascending: false }),
    sb.from('nanime_affinity_mission_claims').select('mission_id').eq('bond_id', bondId).eq('user_id', uid).eq('claim_day', today)
  ]);
  if (missions.error) throw missions.error;
  if (claims.error) throw claims.error;
  const done = new Set(((claims.data || []) as Array<{ mission_id: string }>).map(row => row.mission_id));
  return ((missions.data || []) as Omit<AffinityMission, 'claimed'>[]).map(row => ({ ...row, claimed: done.has(row.mission_id) }));
}

export async function proposeAffinity(partnerId: string, tier: AffinityTier, message = ''): Promise<void> {
  const { error } = await api().rpc('nanime_affinity_propose', { p_partner_id: partnerId, p_tier: tier, p_message: message });
  if (error) throw error;
}
export async function respondAffinity(bondId: string, action: 'accept' | 'reject'): Promise<void> {
  const { error } = await api().rpc('nanime_affinity_respond', { p_bond_id: bondId, p_action: action });
  if (error) throw error;
}
export async function closeAffinity(bondId: string, action: 'cancel' | 'break'): Promise<void> {
  const { error } = await api().rpc('nanime_affinity_close', { p_bond_id: bondId, p_action: action });
  if (error) throw error;
}
export async function claimAffinityMission(bondId: string, missionId: string): Promise<void> {
  const { error } = await api().rpc('nanime_affinity_claim_mission', { p_bond_id: bondId, p_mission_id: missionId });
  if (error) throw error;
}
export async function setAffinityPrivacy(visibility: AffinityPrivacy): Promise<void> {
  const { error } = await api().rpc('nanime_affinity_set_privacy', { p_visibility: visibility });
  if (error) throw error;
}
export async function loadPublicAffinities(userId: string): Promise<AffinityBond[]> {
  const { data, error } = await api().rpc('get_nanime_public_affinities', { p_user_id: userId });
  if (error) throw error;
  const rows = (data || []) as AffinityBond[];
  const people = await profiles(rows.map(row => row.proposer_id === userId ? row.partner_id : row.proposer_id));
  return rows.filter(row => row.status === 'active').map(row => ({ ...row, person: people.get(row.proposer_id === userId ? row.partner_id : row.proposer_id) }));
}

export async function loadAffinityLeaderboard(): Promise<AffinityLeaderboardRow[]> {
  const { data, error } = await api().rpc('get_nanime_affinity_leaderboard', { p_limit: 20 });
  if (error) throw error;
  const rows = (data || []) as Array<{ bond_id: string; tier: AffinityTier; xp: number; user_a: string; user_b: string }>;
  const people = await profiles(rows.flatMap(row => [row.user_a, row.user_b]));
  return rows.map(row => ({ ...row, user_a: people.get(row.user_a) || { id: row.user_a, username: 'Pengguna Nanime', avatar_url: null, rank: 'bronze' }, user_b: people.get(row.user_b) || { id: row.user_b, username: 'Pengguna Nanime', avatar_url: null, rank: 'bronze' } }));
}
