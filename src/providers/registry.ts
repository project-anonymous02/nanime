import type { AnimeProvider, ProviderHealth } from './types';
import { otakudesu } from './legacy';
import { samehadaku } from './samehadaku';
import { animeku } from './AnimeKuProvider';

/**
 * Registry sumber aktif:
 *   1. Otakudesu  → katalog, detail, episode, streaming utama.
 *   2. Samehadaku → pelengkap ketika data Otakudesu kurang.
 *   3. Animeku    → fallback terakhir.
 * Integrasi provider lain sengaja dihapus agar tidak ada pemanggilan borongan.
 */

const PROVIDER_LIST: AnimeProvider[] = [otakudesu, samehadaku, animeku];

/** Provider katalog resmi, urut sesuai peran. */
export const OFFICIAL_PROVIDER_IDS = ['otakudesu', 'samehadaku', 'animeku'] as const;

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

/** Provider non-dewasa yang boleh dipakai untuk katalog/streaming. */
export function officialProviders(): AnimeProvider[] {
  return PROVIDER_LIST.filter(p => p.active && p.content !== 'hentai').sort((a, b) => a.priority - b.priority);
}

/** Provider aktif yang menyediakan pencarian; urut prioritas peran. */
export function searchProviders(preferred?: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && p.searchable);
  list.sort((a, b) => {
    if (preferred && a.id === preferred) return -1;
    if (preferred && b.id === preferred) return 1;
    return a.priority - b.priority;
  });
  return list;
}

/** Urutan provider untuk home/detail: preferensi pengguna lebih dulu, lalu prioritas. */
export function orderedProviders(preferred: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && p.content !== 'hentai' && !p.movieOnly && !p.downloadOnly);
  list.sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return a.priority - b.priority;
  });
  return list;
}

/** Provider yang punya kemampuan streaming (untuk mesin fallback pemutaran). */
export function streamingProviders(preferred?: string): AnimeProvider[] {
  const list = PROVIDER_LIST.filter(p => p.active && p.content !== 'hentai' && !p.downloadOnly && !p.movieOnly);
  list.sort((a, b) => {
    if (preferred && a.id === preferred) return -1;
    if (preferred && b.id === preferred) return 1;
    return streamingPriority(a.id) - streamingPriority(b.id);
  });
  return list;
}

/** Prioritas stream mengikuti peran provider: utama → pelengkap → fallback. */
export function streamingPriority(id: string): number {
  return BY_ID[id]?.priority ?? 999;
}

/** Provider yang menyediakan tautan unduh (tanpa sumber dewasa). */
export function downloadProviders(): AnimeProvider[] {
  return PROVIDER_LIST.filter(
    p => p.active && p.content !== 'hentai' && (p.downloadOnly || p.movieOnly || typeof p.downloads === 'function')
  ).sort((a, b) => a.priority - b.priority);
}

export function markHealth(id: string, ok: boolean, message?: string): void {
  HEALTH[id] = { id, ok, message, checkedAt: Date.now() };
}

export function providerHealth(id: string): ProviderHealth | null {
  return HEALTH[id] || null;
}

/** Provider streaming prioritas tertinggi — Otakudesu. */
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
