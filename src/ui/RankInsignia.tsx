import { RANK_META, type RankTier } from '../lib/rank';

/** Badge rank memakai art dari public/anibiplay-ranks (aset foto, dicatat di planning.md). */
export function RankInsignia({ rank, size = 20 }: { rank: RankTier; size?: number }) {
  const art = RANK_META[rank].art;
  const src = `${import.meta.env.BASE_URL}anibiplay-ranks/profile_level_${art}.png`;
  return <img src={src} width={size} height={size} alt={RANK_META[rank].label} title={RANK_META[rank].label} loading="lazy" decoding="async" />;
}
