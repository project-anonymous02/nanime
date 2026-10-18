import type { RankTier } from '../lib/rank';

const SOURCE_LEVEL: Record<RankTier, string> = {
  bronze: 'stone', silver: 'silver', gold: 'gold', platinum: 'emerald', diamond: 'diamond', developer: 'eternal'
};

/** AniBiPlay rank artwork, mapped onto Nanime's existing public rank tiers. */
export function RankInsignia({ rank, size = 20 }: { rank: RankTier; size?: number }) {
  const level = SOURCE_LEVEL[rank];
  return <img className="rank-insignia" src={`${import.meta.env.BASE_URL}anibiplay-ranks/profile_level_${level}.png`} width={size} height={size} alt={`${rank} rank`} loading="lazy" decoding="async" />;
}
