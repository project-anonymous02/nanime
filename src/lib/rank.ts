export type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'developer';
export const RANK_META: Record<RankTier, { label: string; color: string }> = {
  bronze: { label: 'Bronze', color: '#f0a36b' }, silver: { label: 'Silver', color: '#e5e7eb' },
  gold: { label: 'Gold', color: '#f5c518' }, platinum: { label: 'Platinum', color: '#67e8f9' },
  diamond: { label: 'Diamond', color: '#60a5fa' }, developer: { label: 'Developer', color: '#f472b6' }
};
export function rankFor(seconds: number, developer = false): RankTier {
  if (developer) return 'developer';
  if (seconds >= 100000) return 'diamond';
  if (seconds >= 50000) return 'platinum';
  if (seconds >= 20000) return 'gold';
  if (seconds >= 5000) return 'silver';
  return 'bronze';
}
