import { getClient } from './supabase';
import { currentUserId } from '../state/auth';

export interface GameClan { id: string; name: string; tag: string; description: string; owner_id: string; created_at: string; treasury_balance?: number; color_essence?: number; active_color_id?: string | null; }
export interface ClanMembership { clan_id: string; user_id: string; role: 'leader' | 'member'; joined_at: string; clan: GameClan; }
export interface CrystalLedgerEntry { id: string; amount: number; reason: string; clan_id: string | null; created_at: string; }
export interface ClanJoinRequest { id: string; clan_id: string; user_id: string; status: 'pending' | 'accepted' | 'declined'; created_at: string; username?: string; avatar_url?: string | null; }
export interface ClanMessage { id: string; clan_id: string; sender_id: string; content: string; created_at: string; username: string; avatar_url: string | null; }
export interface ClanColor { id: string; slug: string; name: string; rarity: string; primary_color: string; secondary_color: string; accent_color: string; duplicate_essence: number; }
export interface ClanColorInventory { color: ClanColor; acquired_at: string; }
export interface ClanColorGachaResult { pullType: string; cost: number; treasuryBalanceAfter: number; essenceGained: number; essenceBalanceAfter: number; pity: Record<string, number>; items: Array<{ id: string; paletteId: string; name: string; rarity: string; primaryColor: string; secondaryColor: string; accentColor: string; duplicate: boolean; essence: number }>; }
export interface ClanColorGachaConfig { single_cost: number; ten_cost: number; common_weight: number; rare_weight: number; epic_weight: number; legendary_weight: number; mythic_weight: number; rare_pity: number; epic_pity: number; legendary_pity: number; mythic_pity: number; }
function client() { const sb = getClient(); if (!sb) throw new Error('Supabase Nanime belum dikonfigurasi'); if (!currentUserId()) throw new Error('Masuk untuk memakai fitur Nanime Games'); return sb; }

export async function loadGameHub(): Promise<{ crystals: number; clan: ClanMembership | null; clans: GameClan[]; ledger: CrystalLedgerEntry[]; lastDailyClaimAt: string | null; ownRequests: ClanJoinRequest[]; incomingRequests: ClanJoinRequest[] }> {
  const sb = client(); const uid = currentUserId()!;
  const [wallet, membership, clans, ledger, dailyClaim] = await Promise.all([
    sb.from('nanime_game_wallets').select('crystals').eq('user_id', uid).maybeSingle(),
    sb.from('nanime_game_clan_members').select('clan_id,user_id,role,joined_at,clan:nanime_game_clans(id,name,tag,description,owner_id,created_at,treasury_balance,color_essence,active_color_id)').eq('user_id', uid).maybeSingle(),
    sb.from('nanime_game_clans').select('id,name,tag,description,owner_id,created_at').order('created_at', { ascending: false }).limit(40),
    sb.from('nanime_crystal_ledger').select('id,amount,reason,clan_id,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
    sb.from('nanime_clan_daily_claims').select('created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  for (const result of [wallet, membership, clans, ledger, dailyClaim]) if (result.error) throw result.error;
  const raw = membership.data as unknown as (Omit<ClanMembership, 'clan'> & { clan: GameClan | GameClan[] | null }) | null;
  const linked = raw?.clan;
  const clan = raw && linked ? { ...raw, clan: Array.isArray(linked) ? linked[0] : linked } as ClanMembership : null;
  const ownQuery = await sb.from('nanime_game_clan_join_requests').select('id,clan_id,user_id,status,created_at').eq('user_id', uid).eq('status', 'pending');
  if (ownQuery.error) throw ownQuery.error;
  let incomingRequests: ClanJoinRequest[] = [];
  if (clan?.role === 'leader') {
    const incoming = await sb.from('nanime_game_clan_join_requests').select('id,clan_id,user_id,status,created_at').eq('clan_id', clan.clan_id).eq('status', 'pending').order('created_at', { ascending: true });
    if (incoming.error) throw incoming.error;
    const requests = (incoming.data || []) as ClanJoinRequest[];
    if (requests.length) {
      const { data: profiles, error: profileError } = await sb.rpc('get_public_profiles', { p_user_ids: [...new Set(requests.map(request => request.user_id))] });
      if (profileError) throw profileError;
      const people = new Map(((profiles || []) as Array<{ id: string; username: string; avatar_url: string | null }>).map(profile => [profile.id, profile]));
      incomingRequests = requests.map(request => ({ ...request, username: people.get(request.user_id)?.username || 'Pengguna Nanime', avatar_url: people.get(request.user_id)?.avatar_url || null }));
    }
  }
  return { crystals: Number(wallet.data?.crystals || 0), clan, clans: (clans.data || []) as GameClan[], ledger: (ledger.data || []) as CrystalLedgerEntry[], lastDailyClaimAt: dailyClaim.data?.created_at || null, ownRequests: (ownQuery.data || []) as ClanJoinRequest[], incomingRequests };
}
export async function createGameClan(name: string, tag: string, description: string): Promise<GameClan> {
  const { data, error } = await client().rpc('nanime_create_clan', { p_name: name, p_tag: tag, p_description: description });
  if (error) throw error; return data as GameClan;
}
export async function requestGameClan(clanId: string): Promise<void> {
  const { error } = await client().rpc('nanime_request_clan_join', { p_clan_id: clanId });
  if (error) throw error;
}
export async function reviewGameClanRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await client().rpc('nanime_review_clan_join', { p_request_id: requestId, p_approve: approve });
  if (error) throw error;
}
export async function cancelGameClanRequest(requestId: string): Promise<void> {
  const { error } = await client().rpc('nanime_cancel_clan_join', { p_request_id: requestId });
  if (error) throw error;
}
export async function leaveGameClan(): Promise<void> { const { error } = await client().rpc('nanime_leave_clan'); if (error) throw error; }
export async function closeGameClan(): Promise<void> { const { error } = await client().rpc('nanime_close_clan'); if (error) throw error; }
export async function claimClanDaily(): Promise<{ crystals: number; claimed_amount: number; can_claim: boolean; next_claim_at: string }> {
  const { data, error } = await client().rpc('nanime_claim_clan_daily');
  if (error) throw error; const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Klaim harian tidak memberikan hasil'); return row as { crystals: number; claimed_amount: number; can_claim: boolean; next_claim_at: string };
}

export async function loadClanMessages(clanId: string): Promise<ClanMessage[]> {
  const sb = client();
  const { data, error } = await sb.from('nanime_game_clan_messages').select('id,clan_id,sender_id,content,created_at').eq('clan_id', clanId).order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  const rows = (data || []) as Array<Omit<ClanMessage, 'username' | 'avatar_url'>>;
  if (!rows.length) return [];
  const { data: people, error: peopleError } = await sb.rpc('get_public_profiles', { p_user_ids: [...new Set(rows.map(row => row.sender_id))] });
  if (peopleError) throw peopleError;
  const profiles = new Map(((people || []) as Array<{ id: string; username: string; avatar_url: string | null }>).map(person => [person.id, person]));
  return rows.reverse().map(row => ({ ...row, username: profiles.get(row.sender_id)?.username || 'Pengguna Nanime', avatar_url: profiles.get(row.sender_id)?.avatar_url || null }));
}

export async function sendClanMessage(clanId: string, content: string): Promise<void> {
  const text = content.trim();
  if (!text || text.length > 2000) throw new Error('Pesan harus berisi 1–2000 karakter');
  const { error } = await client().from('nanime_game_clan_messages').insert({ clan_id: clanId, sender_id: currentUserId(), content: text });
  if (error) throw error;
}

export async function donateClanTreasury(clanId: string, amount: number): Promise<number> {
  const { data, error } = await client().rpc('nanime_donate_clan_treasury', { p_clan_id: clanId, p_amount: amount });
  if (error) throw error;
  return Number(data) || 0;
}

export async function loadClanColors(clanId: string): Promise<{ catalog: ClanColor[]; inventory: ClanColorInventory[]; pity: Record<string, number>; config: ClanColorGachaConfig }> {
  const sb = client();
  const [catalog, inventory, pity, config] = await Promise.all([
    sb.from('nanime_game_color_catalog').select('id,slug,name,rarity,primary_color,secondary_color,accent_color,duplicate_essence').eq('active', true).order('rarity').order('name'),
    sb.from('nanime_game_clan_colors').select('acquired_at,color:nanime_game_color_catalog(id,slug,name,rarity,primary_color,secondary_color,accent_color,duplicate_essence)').eq('clan_id', clanId).order('acquired_at', { ascending: false }),
    sb.from('nanime_game_clan_color_pity').select('rare_count,epic_count,legendary_count,mythic_count').eq('clan_id', clanId).maybeSingle(),
    sb.from('nanime_game_color_gacha_config').select('single_cost,ten_cost,common_weight,rare_weight,epic_weight,legendary_weight,mythic_weight,rare_pity,epic_pity,legendary_pity,mythic_pity').eq('singleton', true).single()
  ]);
  for (const result of [catalog, inventory, pity, config]) if (result.error) throw result.error;
  const rows = (inventory.data || []) as unknown as Array<{ acquired_at: string; color: ClanColor | ClanColor[] | null }>;
  return { catalog: (catalog.data || []) as ClanColor[], inventory: rows.flatMap(row => { const color = Array.isArray(row.color) ? row.color[0] : row.color; return color ? [{ color, acquired_at: row.acquired_at }] : []; }), pity: { rare: pity.data?.rare_count || 0, epic: pity.data?.epic_count || 0, legendary: pity.data?.legendary_count || 0, mythic: pity.data?.mythic_count || 0 }, config: config.data as ClanColorGachaConfig };
}

export async function spinClanColors(clanId: string, count: 1 | 10): Promise<ClanColorGachaResult> {
  const { data, error } = await client().rpc('nanime_spin_clan_color', { p_clan_id: clanId, p_count: count });
  if (error) throw error;
  return data as ClanColorGachaResult;
}

export async function activateClanColor(clanId: string, colorId: string | null): Promise<void> {
  const { error } = await client().rpc('nanime_set_clan_color', { p_clan_id: clanId, p_color_id: colorId });
  if (error) throw error;
}
