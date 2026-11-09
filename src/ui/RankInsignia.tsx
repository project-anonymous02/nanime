import { useState } from 'react';
import { RANK_META, type RankTier } from '../lib/rank';

/** Badge rank memakai art dari public/anibiplay-ranks (aset foto, dicatat di planning.md). */
export function RankInsignia({ rank, size = 20 }: { rank: RankTier; size?: number }) {
  const art = RANK_META[rank].art;
  const meta = RANK_META[rank];
  const [src, setSrc] = useState(() => `${import.meta.env.BASE_URL}anibiplay-ranks/profile_level_${art}.png`);
  const [hidden, setHidden] = useState(false);
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={meta.label}
      title={meta.label}
      loading="lazy"
      decoding="async"
      style={hidden ? { display: 'none' } : undefined}
      onError={() => {
        const fallback = `${import.meta.env.BASE_URL}anibiplay-ranks/profile_level_eternal.png`;
        if (src !== fallback) setSrc(fallback);
        else setHidden(true);
      }}
    />
  );
}
