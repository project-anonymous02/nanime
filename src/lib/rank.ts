/**
 * Rank berbasis total penggunaan app (foreground). Semua dihitung klien dari
 * `app_usage_totals.seconds` (persist server-side oleh migrasi 004) sehingga
 * tidak ada penghitungan ganda dan progres tersimpan aman.
 *
 * Progresi: tier 1 butuh 10 menit; tiap tier berikutnya +10 menit
 * (20, 30, 40...) sampai kebutuhan tier akhir mencapai 17 jam (1020 menit).
 */
export type RankTier =
  | 'stone' | 'bronze' | 'silver' | 'gold' | 'emerald' | 'diamond'
  | 'master' | 'mythic' | 'celestial' | 'eternal'
  | 'eternal2' | 'eternal3' | 'eternal4' | 'eternal5'
  | 'developer';

export interface RankTierMeta {
  tier: RankTier;
  label: string;
  /** Nama file art di public/anibiplay-ranks (tanpa prefix/suffix). */
  art: string;
  /** Kumulatif menit yang dibutuhkan tier ini. */
  minutes: number;
  color: string;
}

// Kumulatif menit: 10 +10, +20, +30, ... dibatasi agar tier terakhir tepat 17 jam.
export const RANK_TIERS: RankTierMeta[] = [
  { tier: 'stone',     label: 'Stone',      art: 'stone',     minutes: 10,   color: '#9aa3ad' },
  { tier: 'bronze',    label: 'Bronze',     art: 'bronze',    minutes: 30,   color: '#f0a36b' },
  { tier: 'silver',    label: 'Silver',     art: 'silver',    minutes: 60,   color: '#e5e7eb' },
  { tier: 'gold',      label: 'Gold',       art: 'gold',      minutes: 100,  color: '#f5c518' },
  { tier: 'emerald',   label: 'Emerald',    art: 'emerald',   minutes: 150,  color: '#34d399' },
  { tier: 'diamond',   label: 'Diamond',    art: 'diamond',   minutes: 210,  color: '#60a5fa' },
  { tier: 'master',    label: 'Master',     art: 'master',    minutes: 280,  color: '#a78bfa' },
  { tier: 'mythic',    label: 'Mythic',     art: 'mythic',    minutes: 360,  color: '#fb7185' },
  { tier: 'celestial', label: 'Celestial',  art: 'celestial', minutes: 450,  color: '#22d3ee' },
  { tier: 'eternal',   label: 'Eternal',    art: 'eternal',   minutes: 550,  color: '#f472b6' },
  { tier: 'eternal2',  label: 'Eternal II', art: 'eternal',   minutes: 660,  color: '#e879f9' },
  { tier: 'eternal3',  label: 'Eternal III',art: 'eternal',   minutes: 780,  color: '#c084fc' },
  { tier: 'eternal4',  label: 'Eternal IV', art: 'eternal',   minutes: 910,  color: '#818cf8' },
  { tier: 'eternal5',  label: 'Eternal V',  art: 'eternal',   minutes: 1020, color: '#fda4af' }
];

export const RANK_META: Record<RankTier, RankTierMeta> = {
  ...Object.fromEntries(RANK_TIERS.map(t => [t.tier, t])),
  developer: { tier: 'developer', label: 'Developer', art: 'eternal', minutes: RANK_TIERS[RANK_TIERS.length - 1].minutes, color: '#f472b6' }
} as Record<RankTier, RankTierMeta>;

const ORDER: RankTier[] = [...RANK_TIERS.map(t => t.tier as RankTier), 'developer'];

/** Tier untuk `seconds` penggunaan; developer selalu tier Dev. */
export function rankFor(seconds: number, isDeveloper = false): RankTier {
  if (isDeveloper) return 'developer';
  const minutes = Math.max(0, Math.floor(Number(seconds) || 0)) / 60;
  let out: RankTier = 'stone';
  for (const tier of RANK_TIERS) if (minutes >= tier.minutes) out = tier.tier as RankTier;
  return out;
}

export function rankOrder(tier: RankTier): number {
  return ORDER.indexOf(tier);
}

/** Progres menuju tier berikutnya (null jika sudah di puncak). */
export function rankProgress(seconds: number, isDeveloper = false): { current: RankTierMeta; next: RankTierMeta | null; used: number; span: number } | null {
  const tier = rankFor(seconds, isDeveloper);
  const current = RANK_META[tier];
  if (tier === 'developer') return { current, next: null, used: 0, span: 1 };
  const idx = ORDER.indexOf(tier);
  const next = RANK_TIERS[Math.min(idx + 1, RANK_TIERS.length - 1)];
  const used = Math.max(0, seconds - current.minutes * 60);
  const span = Math.max(1, next.minutes * 60 - current.minutes * 60);
  return { current, next: next.tier === tier ? null : next, used: Math.min(used, span), span };
}

/** Format durasi ringkas, mis. "1 jam 20 menit". */
export function formatUsage(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (!hours && !minutes) return `${seconds} detik`;
  if (!hours) return `${minutes} menit`;
  return `${hours} jam ${minutes} menit`;
}
