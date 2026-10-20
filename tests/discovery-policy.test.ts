import { describe, expect, it } from 'vitest';
import { selectDetailArtwork } from '../src/core/services/Catalog';
import { filterDiscovery, isAdultContent } from '../src/core/services/ContentPolicy';
import { isProviderSearchAllowed } from '../src/core/services/ProviderAggregator';
import { normalizeCard } from '../src/core/normalize';
import type { Card } from '../src/core/types';

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'one-piece', provider: 'doronime', title: 'One Piece', poster: 'https://img.test/one-piece.jpg',
    score: '', type: 'TV', status: '', epLabel: '', sub: '', sourceUrl: '', ...overrides
  };
}

describe('detail hero artwork selection', () => {
  it('uses relevant detail banner first while preserving a valid search poster', () => {
    const result = selectDetailArtwork('https://img.test/search-poster.jpg', [
      { poster: '', banner: 'https://img.test/detail-banner.jpg' }
    ]);
    expect(result).toEqual({
      poster: 'https://img.test/search-poster.jpg',
      heroImage: 'https://img.test/detail-banner.jpg'
    });
  });

  it('falls back to the indexed poster when detail artwork is absent or invalid', () => {
    const result = selectDetailArtwork('https://img.test/search-poster.jpg', [
      { poster: 'javascript:alert(1)', banner: '/relative/banner.jpg', cover: 'data:image/png;base64,abc' }
    ]);
    expect(result.poster).toBe('https://img.test/search-poster.jpg');
    expect(result.heroImage).toBe('https://img.test/search-poster.jpg');
  });
});

describe('discovery content policy', () => {
  it('keeps explicit adult providers out of default search and allows an opt-in selection', () => {
    const provider = { id: 'nekopoi', content: 'hentai' as const };
    expect(isProviderSearchAllowed(provider)).toBe(false);
    expect(isProviderSearchAllowed(provider, ['other-adult-provider'])).toBe(false);
    expect(isProviderSearchAllowed(provider, ['nekopoi'])).toBe(true);
    expect(isProviderSearchAllowed(provider, undefined, true)).toBe(true);
    expect(isProviderSearchAllowed({ id: 'animasu', content: 'anime' }, ['nekopoi'])).toBe(false);
  });

  it('filters adult metadata before results are exposed to discovery feeds', () => {
    const safe = card({ id: 'safe', title: 'One Piece', genres: ['Action', 'Adventure'] });
    const adult = card({ id: 'adult', title: 'Untitled', genres: ['Hentai'] });
    const adultProvider = card({ id: 'source', provider: 'nekopoi', title: 'Untitled' });
    expect(filterDiscovery([safe, adult, adultProvider]).map(item => item.id)).toEqual(['safe']);
  });

  it('keeps normal anime genres while excluding explicit adult ratings', () => {
    const safe = card({ genres: ['Romance', 'Comedy'], contentRating: 'PG-13' });
    const adult = card({ genres: ['Drama'], contentRating: 'R18+' });
    expect(filterDiscovery([safe, adult])).toEqual([safe]);
  });

  it('rejects explicit adult labels in title metadata while retaining unrelated ordinary titles', () => {
    expect(isAdultContent({ title: '[Hentai] Example' })).toBe(true);
    expect(isAdultContent({ title: 'Example', altTitles: ['[Hentai] Original Title'] })).toBe(true);
    expect(isAdultContent({ title: 'Hentai', alt: '別名' })).toBe(true);
    expect(isAdultContent({ title: 'The Adult Swim Show', genres: ['Comedy'] })).toBe(false);
  });

  it('fails closed for mixed sources without classification metadata', () => {
    expect(filterDiscovery([card({ provider: 'gomunime', title: 'Unknown Classification' })])).toEqual([]);
    expect(filterDiscovery([card({ provider: 'gomunime', genres: ['Action'] })])).toHaveLength(1);
  });

  it('preserves category metadata from provider records for the feed filter', () => {
    const sourced = normalizeCard({ animeId: 'a', title: 'Untitled', genreList: [{ title: 'Hentai' }] }, 'otakudesu');
    expect(sourced?.genres).toEqual(['Hentai']);
    expect(filterDiscovery(sourced ? [sourced] : [])).toEqual([]);
  });
});
