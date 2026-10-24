import { afterEach, describe, expect, it, vi } from 'vitest';
import { Catalog } from '../src/core/services/Catalog';
import { CacheManager } from '../src/core/services/CacheManager';
import { TitleIndex } from '../src/core/services/TitleIndex';
import { getProvider } from '../src/providers/registry';
import type { Card, Detail, EpisodeItem } from '../src/core/types';

let serial = 0;

function episode(num: number, provider: string): EpisodeItem {
  return { num: String(num), id: `${provider}-ep-${num}`, slug: `${provider}-ep-${num}`, date: '' };
}

function detail(provider: string, over: Partial<Detail> = {}): Detail {
  const count = Number(over.episodes || 12);
  return {
    id: `${provider}-source`,
    slug: `${provider}-source`,
    provider,
    title: 'Bleach',
    alt: '',
    poster: 'https://img.test/bleach.jpg',
    score: '8.2',
    type: 'TV',
    status: 'Ongoing',
    year: '2004',
    episodes: String(count),
    duration: '24 min',
    studio: 'Studio',
    genres: [{ t: 'Action', id: 'action' }],
    synopsis: 'Sinopsis lengkap.',
    downloads: [],
    episodeList: Array.from({ length: count }, (_, i) => episode(i + 1, provider)),
    recommendations: [],
    ...over
  };
}

function card(provider: string): Card {
  return {
    id: `${provider}-source`,
    provider,
    title: 'Bleach',
    poster: 'https://img.test/bleach.jpg',
    score: '',
    type: 'TV',
    status: '',
    epLabel: '',
    sub: '',
    sourceUrl: ''
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('Catalog lazy detail fallback', () => {
  it('fills only the missing synopsis and episode, then stops before Animeku', async () => {
    const id = `lazy-detail-${++serial}`;
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;

    await TitleIndex.upsert({
      id,
      title: 'Bleach',
      type: 'TV',
      sources: [{ provider: 'otakudesu', id: 'odu-1', slug: 'odu-1' }]
    });

    vi.spyOn(ota, 'detail').mockResolvedValue(detail('otakudesu', {
      synopsis: 'Sinopsis tidak tersedia.',
      genres: [],
      episodes: '12',
      episodeList: Array.from({ length: 11 }, (_, i) => episode(i + 1, 'otakudesu'))
    }));
    const search = vi.spyOn(sama, 'search').mockResolvedValue([card('samehadaku')]);
    vi.spyOn(sama, 'detail').mockResolvedValue(detail('samehadaku'));
    const animekuSearch = vi.spyOn(animeku, 'search').mockResolvedValue([]);

    const bundle = await Catalog.detail(id, { title: 'Bleach' });

    expect(bundle.title).toBe('Bleach');
    expect(bundle.synopsis).toBe('Sinopsis lengkap.');
    expect(bundle.genres).toEqual(['Action']);
    expect(bundle.episodeList).toHaveLength(12);
    expect(bundle.episodeList[11].num).toBe('12');
    expect(bundle.episodeList[11].sources.map(source => source.provider)).toContain('samehadaku');
    expect(bundle.providers).toEqual(['otakudesu', 'samehadaku']);
    expect(search).toHaveBeenCalledTimes(1);
    expect(animekuSearch).not.toHaveBeenCalled();
  });

  it('does not call fallback providers when the primary detail is complete', async () => {
    const id = `complete-detail-${++serial}`;
    const ota = getProvider('otakudesu')!;
    const sama = getProvider('samehadaku')!;
    const animeku = getProvider('animeku')!;

    await TitleIndex.upsert({
      id,
      title: 'Bleach',
      type: 'TV',
      sources: [{ provider: 'otakudesu', id: 'odu-2', slug: 'odu-2' }]
    });

    vi.spyOn(ota, 'detail').mockResolvedValue(detail('otakudesu'));
    const samaSearch = vi.spyOn(sama, 'search').mockResolvedValue([]);
    const animekuSearch = vi.spyOn(animeku, 'search').mockResolvedValue([]);

    const bundle = await Catalog.detail(id, { title: 'Bleach' });

    expect(bundle.providers).toEqual(['otakudesu']);
    expect(bundle.episodeList).toHaveLength(12);
    expect(samaSearch).not.toHaveBeenCalled();
    expect(animekuSearch).not.toHaveBeenCalled();
  });

  it('rebuilds the provider index when a cached detail survives without its TitleIndex entry', async () => {
    const id = `cached-detail-index-${++serial}`;
    const ota = getProvider('otakudesu')!;
    await TitleIndex.upsert({
      id,
      title: 'Bleach',
      type: 'TV',
      sources: [{ provider: 'otakudesu', id: `${id}-source`, slug: `${id}-source` }]
    });
    vi.spyOn(ota, 'detail').mockResolvedValue(detail('otakudesu'));
    await Catalog.detail(id, { title: 'Bleach' });

    const detailCache = vi.spyOn(CacheManager, 'detail');
    vi.spyOn(TitleIndex, 'get').mockImplementationOnce(async () => null);
    const cached = await Catalog.detail(id, { title: 'Bleach' });

    expect(cached.episodeList).toHaveLength(12);
    expect(detailCache).toHaveBeenCalled();
    expect(await TitleIndex.get(id)).toBeTruthy();
  });
});
