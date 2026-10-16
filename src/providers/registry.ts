import type { AnimeProvider, ProviderHealth } from './types';
import { otakudesu, oploverz, kuramanime, kusonime } from './legacy';
import { anichin } from './anichin';
import { samehadaku } from './samehadaku';
import { lendrive } from './lendrive';
import { doronime } from './DoronimeProvider';
import { ylnime } from './YlnimeProvider';
import { animeindo } from './AnimeIndoProvider';
import { animekulol } from './AnimeKuLolProvider';
import { nimegami } from './NimegamiProvider';
import { sakunime } from './SakunimeProvider';
import { animekuindo } from './AnimeKuindoProvider';
import { samehadakuhow } from './SamehadakuHowProvider';
import { moenime } from './MoenimeProvider';
import { alqanime } from './AlqanimeProvider';
import { animekuonline } from './AnimeKuOnlineProvider';
import { anoboy } from './AnoboyProvider';

/**
 * Registry seluruh sumber. Urutan = prioritas (nilai kecil lebih dulu).
 * Urutan pemutaran yang diinginkan:
 * Doronime > Ylnime > AnimeIndo > AnimeKuLol > Nimegami > Sakunime > AnimeKuindo
 * > provider lama > Anoboy PALING AKHIR.
 * Provider unduhan murni (Moenime, Alqanime, AnimeKuOnline) tidak pernah jadi sumber stream.
 */

const PROVIDER_LIST: AnimeProvider[] = [
  doronime,
  ylnime,
  animeindo,
  animekulol,
  nimegami,
  sakunime,
  animekuindo,
  otakudesu,
  oploverz,
  kuramanime,
  kusonime,
  samehadaku,
  samehadakuhow,
  anichin,
  lendrive,
  moenime,
  alqanime,
  animekuonline,
  anoboy
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
  const list = PROVIDER_LIST.filter(p => p.active && !p.movieOnly && !p.downloadOnly);
  list.sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return a.priority - b.priority;
  });
  return list;
}

/** Provider yang punya kemampuan streaming (untuk mesin fallback pemutaran). */
export function streamingProviders(preferred?: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && !p.downloadOnly && !p.movieOnly);
  if (preferred) list.sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.priority - b.priority));
  else list.sort((a, b) => a.priority - b.priority);
  return list;
}

/** Provider yang menyediakan tautan unduh (untuk tab Download). */
export function downloadProviders(): AnimeProvider[] {
  return PROVIDER_LIST.filter(p => p.active && (p.downloadOnly || p.movieOnly || typeof p.downloads === 'function')).sort(
    (a, b) => a.priority - b.priority
  );
}

export function markHealth(id: string, ok: boolean, message?: string): void {
  HEALTH[id] = { id, ok, message, checkedAt: Date.now() };
}

export function providerHealth(id: string): ProviderHealth | null {
  return HEALTH[id] || null;
}

/** Provider streaming prioritas tertinggi — dipakai sebagai default otomatis (tanpa pemilih). */
export function autoProviderId(): string {
  return streamingProviders()[0]?.id || 'otakudesu';
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
