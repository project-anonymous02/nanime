import { getProvider } from '../../providers/registry';
import { TitleIndex } from './TitleIndex';

const CACHE_MS = 30 * 60 * 1000;
const EMPTY_NEGATIVE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; images: string[] }>();
const pending = new Map<string, Promise<string[]>>();

const IMAGE_CACHE_NAME = 'nanime-images-v1';
const IMAGE_CACHE_MAX_ENTRIES = 200;
const IMAGE_CACHE_MAX_BYTES = 50 * 1024 * 1024;

export async function cacheImage(url: string): Promise<string> {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    if (!('caches' in window)) return trimmed;
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const hit = await cache.match(trimmed);
    if (hit) return await hit.text();
    const res = await fetch(trimmed, { mode: 'cors' });
    if (!res.ok) return trimmed;
    const clone = res.clone();
    await cache.put(trimmed, clone);
    // LRU prune
    const keys = await cache.keys();
    if (keys.length > IMAGE_CACHE_MAX_ENTRIES) {
      await cache.delete(keys[0]);
    }
    try {
      if ('storage' in navigator && typeof navigator.storage?.estimate === 'function') {
        const est = await navigator.storage.estimate();
        if ((est.usage || 0) > IMAGE_CACHE_MAX_BYTES * 0.9) {
          const all = await cache.keys();
          for (const k of all.slice(0, Math.max(1, all.length - IMAGE_CACHE_MAX_ENTRIES + 50))) {
            await cache.delete(k);
          }
        }
      }
    } catch { /* noop */ }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export async function getCachedImage(url: string): Promise<string | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) return null;
    return await hit.text();
  } catch { return null; }
}

function usable(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || /^(data:|javascript:)/i.test(raw)) return '';
  try {
    const url = new URL(raw, location.href);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}

/** Fetch only a few already-indexed sources, and only after the primary artwork fails. */
export function resolveAnimeImages(id: string): Promise<string[]> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.images);
  const active = pending.get(id);
  if (active) return active;
  const request = (async () => {
    try {
      const entry = await TitleIndex.get(id);
      if (!entry) return [];
      const found = new Set<string>();
      const indexed = usable(entry.poster);
      if (indexed) found.add(indexed);
      const sources = entry.sources.slice(0, 3);
      await Promise.all(sources.map(async source => {
        try {
          const provider = getProvider(source.provider);
          if (!provider) return;
          const detail = await withTimeout(provider.detail(source.id, source.slug), 7000);
          const value = detail as any;
          for (const field of [value?.banner, value?.cover, value?.poster, value?.image, value?.thumbnail]) {
            const candidate = usable(field);
            if (candidate) found.add(candidate);
          }
        } catch { /* A failed source does not block the other indexed sources. */ }
      }));
      const images = [...found];
      cache.set(id, { at: Date.now(), images });
      // Persist binary images to Cache Storage in background
      void Promise.all(images.slice(0, 4).map(u => cacheImage(u).catch(() => undefined)));
      return images;
    } catch {
      // Do NOT poison cache for 30m on transient failure; use short negative TTL
      const existing = cache.get(id);
      if (!existing || Date.now() - existing.at > EMPTY_NEGATIVE_MS) {
        cache.set(id, { at: Date.now(), images: [] });
      }
      return [];
    } finally {
      if (!cache.has(id)) cache.set(id, { at: Date.now(), images: [] });
    }
  })();
  pending.set(id, request);
  void request.finally(() => pending.delete(id));
  return request;
}

export async function preloadImageCache(urls: string[]): Promise<void> {
  await Promise.all(urls.slice(0, 10).map(u => cacheImage(u).catch(() => undefined)));
}

function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
