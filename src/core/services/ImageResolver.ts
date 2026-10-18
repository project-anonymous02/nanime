import { getProvider } from '../../providers/registry';
import { TitleIndex } from './TitleIndex';

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; images: string[] }>();
const pending = new Map<string, Promise<string[]>>();

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
      return images;
    } catch {
      cache.set(id, { at: Date.now(), images: [] });
      return [];
    } finally {
      if (!cache.has(id)) cache.set(id, { at: Date.now(), images: [] });
    }
  })();
  pending.set(id, request);
  void request.finally(() => pending.delete(id));
  return request;
}

function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
