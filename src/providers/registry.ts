import type { AnimeProvider, ProviderHealth } from './types';
import { otakudesu, oploverz, kuramanime, kusonime } from './legacy';
import { anichin } from './anichin';
import { samehadaku } from './samehadaku';
import { lendrive } from './lendrive';

/**
 * Registry seluruh sumber. Urutan = prioritas (nilai kecil lebih dulu).
 * Health status dicatat per provider berdasarkan hasil pemakaian nyata,
 * sehingga kegagalan bisa dialihkan otomatis ke provider berikutnya.
 */

const PROVIDER_LIST: AnimeProvider[] = [
  otakudesu,
  oploverz,
  kuramanime,
  anichin,
  samehadaku,
  kusonime,
  lendrive
];

const BY_ID: Record<string, AnimeProvider> = {};
PROVIDER_LIST.forEach(p => {
  BY_ID[p.id] = p;
});

const HEALTH: Record<string, ProviderHealth> = {};

export function getProvider(id: string): AnimeProvider | null {
  return BY_ID[id] || null;
}

export function allProviders(): AnimeProvider[] {
  return PROVIDER_LIST.slice();
}

/** Provider aktif untuk pencarian (kecuali sumber unduhan murni bila diminta). */
export function searchProviders(preferred?: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && p.searchable);
  if (preferred) list.sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.priority - b.priority));
  else list.sort((a, b) => a.priority - b.priority);
  return list;
}

/** Urutan provider untuk home/detail: preferensi pengguna lebih dulu, lalu prioritas. */
export function orderedProviders(preferred: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && !p.movieOnly);
  list.sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return a.priority - b.priority;
  });
  return list;
}

export function markHealth(id: string, ok: boolean, message?: string): void {
  HEALTH[id] = { id, ok, message, checkedAt: Date.now() };
}

export function providerHealth(id: string): ProviderHealth | null {
  return HEALTH[id] || null;
}

/** Provider terpilih bila provider utama sehat; fallback otomatis ke berikutnya. */
export function pickHealthy(preferred: string): AnimeProvider[] {
  const ordered = orderedProviders(preferred);
  const p = ordered.find(x => x.id === preferred);
  if (!p) return ordered;
  const hp = HEALTH[preferred];
  if (hp && hp.ok === false) return ordered.filter(x => x.id !== preferred);
  return [p, ...ordered.filter(x => x.id !== preferred)];
}
