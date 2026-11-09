import { getProvider } from '../../providers/registry';
import { TitleIndex } from './TitleIndex';

const CACHE_MS = 30 * 60 * 1000;
const EMPTY_NEGATIVE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; images: string[] }>();
const pending = new Map<string, Promise<string[]>>();

const IMAGE_CACHE_NAME = 'nanime-images-v1';
const IMAGE_CACHE_MAX_ENTRIES = 200;
const IMAGE_CACHE_MAX_BYTES = 50 * 1024 * 1024;
const METADATA_CACHE_MAX_ENTRIES = 500;
const pendingImage = new Map<string, Promise<string>>();

function setMetadataCache(id: string, images: string[]) {
  cache.set(id, { at: Date.now(), images });
  // LRU sederhana: Map mempertahankan urutan insert; buang yang tertua.
  while (cache.size > METADATA_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export async function cacheImage(url: string): Promise<string> {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return trimmed;
  const pending = pendingImage.get(trimmed);
  if (pending) return pending;
  const request = (async () => {
    try {
      if (!('caches' in window)) return trimmed;
      const store = await caches.open(IMAGE_CACHE_NAME);
      const hit = await store.match(trimmed);
      if (hit) return trimmed;
      const res = await fetch(trimmed, { mode: 'cors' });
      if (!res.ok) return trimmed;
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) return trimmed;
      await store.put(trimmed, res.clone());
      // LRU prune: hapus kelebihan hingga di batas.
      const keys = await store.keys();
      if (keys.length > IMAGE_CACHE_MAX_ENTRIES) {
        for (const k of keys.slice(0, keys.length - IMAGE_CACHE_MAX_ENTRIES)) {
          await store.delete(k);
        }
      }
      try {
        if ('storage' in navigator && typeof navigator.storage?.estimate === 'function') {
          const est = await navigator.storage.estimate();
          if ((est.usage || 0) > IMAGE_CACHE_MAX_BYTES * 0.9) {
            const all = await store.keys();
            for (const k of all.slice(0, Math.max(1, all.length - IMAGE_CACHE_MAX_ENTRIES + 50))) {
              await store.delete(k);
            }
          }
        }
      } catch { /* noop */ }
      return trimmed;
    } catch {
      return trimmed;
    }
  })();
  pendingImage.set(trimmed, request);
  try {
    return await request;
  } finally {
    pendingImage.delete(trimmed);
  }
}

export async function getCachedImage(url: string): Promise<string | null> {
  try {
    if (!('caches' in window)) return null;
    const store = await caches.open(IMAGE_CACHE_NAME);
    const hit = await store.match(url);
    if (!hit || !hit.ok) return null;
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
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
  if (cached) {
    const ttl = cached.images.length ? CACHE_MS : EMPTY_NEGATIVE_MS;
    if (Date.now() - cached.at < ttl) {
      // Sentuh urutan LRU.
      cache.delete(id);
      cache.set(id, cached);
      return Promise.resolve(cached.images);
    }
  }
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
      setMetadataCache(id, images);
      // Persist binary images to Cache Storage in background
      void Promise.all(images.slice(0, 4).map(u => cacheImage(u).catch(() => undefined)));
      return images;
    } catch {
      // Do NOT poison cache for 30m on transient failure; use short negative TTL
      const existing = cache.get(id);
      if (!existing || Date.now() - existing.at > EMPTY_NEGATIVE_MS) {
        setMetadataCache(id, []);
      }
      return [];
    } finally {
      if (!cache.has(id)) setMetadataCache(id, []);
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
