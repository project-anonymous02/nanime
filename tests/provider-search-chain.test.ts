import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderAggregator } from '../src/core/services/ProviderAggregator';
import { CacheManager } from '../src/core/services/CacheManager';
import { getProvider } from '../src/providers/registry';
import type { Card } from '../src/core/types';

let serial = 0;

function card(provider: string, title = 'Naruto'): Card {
  return {
    id: `${provider}-naruto`,
    provider,
    title,
    poster: '',
    score: '',
    type: 'TV',
    status: '',
    epLabel: '',
    sub: '',
    sourceUrl: ''
  };
}

async function search(query: string, opts: { includeAdult?: boolean } = {}) {
  return ProviderAggregator.search(query, opts);
}

afterEach(() => { vi.restoreAllMocks(); CacheManager.clear(); });

describe('ProviderAggregator sequential search', () => {
  it('stops at Otakudesu when it already has a relevant match', async () => {
    const query = `naruto stop chain ${++serial}`;
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    vi.spyOn(ota, 'search').mockResolvedValue([card('otakudesu', 'Naruto')]);
    const samaSearch = vi.spyOn(sama, 'search').mockResolvedValue([card('samehadaku', 'Naruto')]);

    const sources = await search(query);

    expect(sources.map(source => source.id)).toEqual(['otakudesu']);
    expect(samaSearch).not.toHaveBeenCalled();
  });

  it('tries Samehadaku only when Otakudesu has no relevant match', async () => {
    const query = `naruto fallback chain ${++serial}`;
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;
    vi.spyOn(ota, 'search').mockResolvedValue([]);
    const samaSearch = vi.spyOn(sama, 'search').mockResolvedValue([card('samehadaku', 'Naruto')]);
    const animekuSearch = vi.spyOn(animeku, 'search').mockResolvedValue([card('animeku', 'Naruto')]);

    const sources = await search(query);

    expect(sources.map(source => source.id)).toEqual(['otakudesu', 'samehadaku']);
    expect(samaSearch).toHaveBeenCalledTimes(1);
    expect(animekuSearch).not.toHaveBeenCalled();
  });

  it('continues to the next provider after the primary provider times out', async () => {
    vi.useFakeTimers();
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;
    vi.spyOn(ota, 'search').mockReturnValue(new Promise<Card[]>(() => undefined));
    const samaSearch = vi.spyOn(sama, 'search').mockResolvedValue([card('samehadaku', 'Naruto')]);
    const animekuSearch = vi.spyOn(animeku, 'search').mockResolvedValue([]);

    try {
      const resultPromise = ProviderAggregator.search('Naruto', { timeout: 20, deadline: 100 });
      await vi.advanceTimersByTimeAsync(20);
      const sources = await resultPromise;

      expect(sources.map(source => source.id)).toEqual(['otakudesu', 'samehadaku']);
      expect(sources[0].ok).toBe(false);
      expect(samaSearch).toHaveBeenCalledTimes(1);
      expect(animekuSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fills home rails lazily and skips Animeku once every rail is filled', async () => {
    CacheManager.clear();
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;
    vi.spyOn(ota, 'home').mockResolvedValue({
      ongoing: [card('otakudesu', 'Naruto')],
      completed: [],
      movie: []
    });
    vi.spyOn(ota as any, 'completed').mockResolvedValue({ list: [], pagination: null });
    vi.spyOn(sama, 'home').mockResolvedValue({
      ongoing: [],
      completed: [card('samehadaku', 'Bleach')],
      movie: [{ ...card('samehadaku', 'Suzume'), type: 'Movie' }]
    });
    const animekuHome = vi.spyOn(animeku, 'home').mockResolvedValue({ ongoing: [], completed: [], movie: [] });

    const feed = await ProviderAggregator.homeFeed({ deadline: 5000 });

    expect(feed.newUpdate[0]?.title).toBe('Naruto');
    expect(feed.completed[0]?.title).toBe('Bleach');
    expect(feed.movie[0]?.title).toBe('Suzume');
    expect(feed.sources.map(source => source.id)).toEqual(['otakudesu', 'samehadaku']);
    expect(animekuHome).not.toHaveBeenCalled();
  });

  it('uses a provider list endpoint only for a rail its home page leaves empty', async () => {
    CacheManager.clear();
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;
    vi.spyOn(ota, 'home').mockResolvedValue({
      ongoing: [card('otakudesu', 'Naruto')],
      completed: [card('otakudesu', 'Bleach')],
      movie: []
    });
    vi.spyOn(sama, 'home').mockResolvedValue({ ongoing: [], completed: [], movie: [] });
    vi.spyOn(sama as any, 'ongoing').mockResolvedValue({ list: [], pagination: null });
    vi.spyOn(sama as any, 'completed').mockResolvedValue({ list: [], pagination: null });
    const movieList = vi.spyOn(sama as any, 'movies').mockResolvedValue({
      list: [{ ...card('samehadaku', 'Suzume'), type: 'Movie' }],
      pagination: null
    });
    const animekuHome = vi.spyOn(animeku, 'home').mockResolvedValue({ ongoing: [], completed: [], movie: [] });

    const feed = await ProviderAggregator.homeFeed({ deadline: 5000 });

    expect(feed.movie[0]?.title).toBe('Suzume');
    expect(movieList).toHaveBeenCalledTimes(1);
    expect(animekuHome).not.toHaveBeenCalled();
  });

  it('bypasses the provider home cache when refreshing the feed', async () => {
    const ota = getProvider('otakudesu')!;
    const title: { value: string } = { value: 'Old update' };
    const home = vi.spyOn(ota, 'home').mockImplementation(async () => ({
      ongoing: [card('otakudesu', title.value)],
      completed: [card('otakudesu', 'Completed title')],
      movie: [{ ...card('otakudesu', 'A movie'), type: 'Movie' }]
    }));

    const cached = await ProviderAggregator.homeFeed();
    title.value = 'Fresh update';
    const fresh = await ProviderAggregator.homeFeed({ fresh: true });

    expect(cached.newUpdate[0]?.title).toBe('Old update');
    expect(fresh.newUpdate[0]?.title).toBe('Fresh update');
    expect(home).toHaveBeenCalledTimes(2);
  });

  it('keeps Nekopoi out of normal search and includes it only on opt-in', async () => {
    const query = `naruto adult chain ${++serial}`;
    const ota = getProvider('otakudesu')!;
    const nekopoi = getProvider('nekopoi')!;
    vi.spyOn(ota, 'search').mockResolvedValue([card('otakudesu', 'Naruto')]);
    const adultSearch = vi.spyOn(nekopoi, 'search').mockResolvedValue([card('nekopoi', 'Naruto')]);

    const normal = await search(query);
    expect(normal.map(source => source.id)).not.toContain('nekopoi');
    expect(adultSearch).not.toHaveBeenCalled();

    const optedIn = await search(`${query} adult`, { includeAdult: true });
    expect(optedIn.map(source => source.id)).toContain('nekopoi');
    expect(adultSearch).toHaveBeenCalledTimes(1);
  });
});
