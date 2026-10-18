import type { AffinityTier } from '../lib/affinity';

const ASSET: Record<AffinityTier, string> = {
  partner: 'pasangan', bros: 'saudara', besties: 'sahabat', confidants: 'confidant'
};

export function AffinityMark({ tier, size = 26, active = false }: { tier: AffinityTier; size?: number; active?: boolean }) {
  const name = ASSET[tier];
  return <img className="affinity-mark" src={`${import.meta.env.BASE_URL}anibiplay-affinity/affinity_${name}${active ? '_up' : ''}.png`} width={size} height={size} alt={`${tier} affinity`} loading="lazy" decoding="async" />;
}
