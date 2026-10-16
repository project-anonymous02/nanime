import { describe, it, expect } from 'vitest';
import { aliasKey, aliasesOf, splitSeason } from '../src/core/utils/titleAliases';
import { matchScore, normalizeTitle, similarity } from '../src/core/utils/fuzzyMatch';
import { canonicalQuality, groupByQuality, qualityRank } from '../src/core/utils/qualitySorter';
import { episodeNumber, mergeEpisodes, mergeDownloads, findByEpisode } from '../src/core/services/EpisodeMatcher';
import { dedupeKey, sortCards, applyFilters, suggestions, sourceSummary } from '../src/core/services/SearchEngine';
import { dedupe } from '../src/core/services/ProviderAggregator';
import { FallbackEngine } from '../src/core/services/FallbackEngine';
import { pickBestCard } from '../src/core/services/DownloadAggregator';
import { allProviders, streamingProviders, downloadProviders, orderedProviders, autoProviderId } from '../src/providers/registry';
import type { Card, EpisodeItem } from '../src/core/types';

const card = (over: Partial<Card> = {}): Card => ({
  id: 'x',
  provider: 'p',
  title: 'Anime',
  poster: '',
  score: '',
  type: '',
  status: '',
  epLabel: '',
  sub: '',
  sourceUrl: '',
  ...over
});

describe('titleAliases', () => {
  it('mengenali sinonim English ↔ Romaji', () => {
    expect(aliasKey('Demon Slayer')).toBe(aliasKey('Kimetsu no Yaiba'));
    expect(aliasKey('Attack on Titan')).toBe(aliasKey('Shingeki no Kyojin'));
    expect(aliasKey('Judul Tak Dikenal')).toBe('');
  });

  it('aliasesOf mengembalikan varian termasuk dirinya', () => {
    expect(aliasesOf('Demon Slayer')).toContain('kimetsu no yaiba');
  });

  it('splitSeason mendeteksi musim', () => {
    expect(splitSeason('Jujutsu Kaisen Season 2')).toEqual({ base: 'Jujutsu Kaisen', season: 2 });
    expect(splitSeason('Attack on Titan')).toEqual({ base: 'Attack on Titan', season: 0 });
  });
});

describe('fuzzyMatch', () => {
  it('normalisasi membuang noise', () => {
    expect(normalizeTitle('Bleach Episode 5 Sub Indo')).toBe('bleach');
  });

  it('exact match = 100', () => {
    expect(matchScore('Bleach', 'Bleach')).toBe(100);
  });

  it('sinonim mendapat skor tinggi', () => {
    expect(matchScore('Demon Slayer', 'Kimetsu no Yaiba')).toBeGreaterThanOrEqual(88);
  });

  it('typo ringan tetap terdeteksi', () => {
    expect(matchScore('Naruto', 'Narutto')).toBeGreaterThan(50);
  });

  it('judul tak berhubungan bernilai rendah', () => {
    expect(matchScore('Naruto', 'One Piece')).toBeLessThan(30);
    expect(similarity('a', '')).toBe(0);
  });
});

describe('qualitySorter', () => {
  it('menilai kualitas', () => {
    expect(qualityRank('1080p')).toBe(1080);
    expect(qualityRank('4K')).toBe(4000);
    expect(canonicalQuality('Full HD')).toBe('1080p');
    expect(canonicalQuality('')).toBe('Lainnya');
  });

  it('mengelompokkan urut dari tertinggi', () => {
    const g = groupByQuality([{ quality: '480p' }, { quality: '1080p' }, { quality: '720p' }]);
    expect(g.map(x => x.quality)).toEqual(['1080p', '720p', '480p']);
  });
});

describe('EpisodeMatcher', () => {
  it('mengekstrak nomor episode', () => {
    expect(episodeNumber('Episode 5')).toBe(5);
    expect(episodeNumber('Eps 05 Sub Indo')).toBe(5);
    expect(isNaN(episodeNumber('Batch'))).toBe(true);
  });

  it('menggabungkan episode dari beberapa provider tanpa duplikat', () => {
    const a: EpisodeItem[] = [{ num: '1', id: 'a1', slug: 's1', date: '' }, { num: '2', id: 'a2', slug: 's2', date: '' }];
    const b: EpisodeItem[] = [{ num: '2', id: 'b2', slug: 's2', date: '2024' }, { num: '3', id: 'b3', slug: 's3', date: '' }];
    const merged = mergeEpisodes([{ provider: 'a', items: a }, { provider: 'b', items: b }]);
    expect(merged.map(e => e.num)).toEqual(['1', '2', '3']);
    expect(merged[1].sources.map(s => s.provider)).toEqual(['a', 'b']);
    expect(merged[1].date).toBe('2024');
  });

  it('findByEpisode & mergeDownloads', () => {
    const items: EpisodeItem[] = [{ num: '10', id: 'x', slug: 's', date: '' }];
    expect(findByEpisode(items, '10')?.id).toBe('x');
    const links = mergeDownloads([[{ quality: '720p', name: 'A', url: 'u1' }], [{ quality: '720p', name: 'B', url: 'u1' }, { quality: '1080p', name: 'C', url: 'u2' }]]);
    expect(links.map(l => l.url)).toEqual(['u1', 'u2']);
  });
});

describe('SearchEngine', () => {
  it('sortCards relevansi menaruh skor tertinggi dulu', () => {
    const items = [card({ title: 'B', match: 40 }), card({ title: 'A', match: 90 })];
    expect(sortCards(items, 'relevance').map(c => c.title)).toEqual(['A', 'B']);
    expect(sortCards(items, 'title').map(c => c.title)).toEqual(['A', 'B']);
  });

  it('applyFilters menyaring tipe & musim', () => {
    const items = [card({ title: 'X Movie', type: 'Movie' }), card({ title: 'Y Season 2', type: 'TV' })];
    expect(applyFilters(items, { types: ['movie'] }).length).toBe(1);
    expect(applyFilters(items, { season: 2 }).map(c => c.title)).toEqual(['Y Season 2']);
  });

  it('dedupeKey mengabaikan provider', () => {
    expect(dedupeKey(card({ title: 'Bleach', provider: 'a', type: 'TV' }))).toBe(
      dedupeKey(card({ title: 'Bleach', provider: 'b', type: 'TV' }))
    );
  });

  it('suggestions & sourceSummary', () => {
    const pool = [card({ title: 'Bleach' }), card({ title: 'Naruto' })];
    expect(suggestions('ble', pool)).toContain('Bleach');
    expect(sourceSummary([{ id: 'a', ok: true, count: 3, items: [] }, { id: 'b', ok: false, count: 0, items: [], error: 'x' }])).toEqual({
      total: 3,
      ok: 1,
      failed: 1
    });
  });
});

describe('ProviderAggregator.dedupe', () => {
  it('membuang judul duplikat mempertahankan yang pertama', () => {
    const out = dedupe([card({ title: 'Bleach', provider: 'a' }), card({ title: 'bleach', provider: 'b' }), card({ title: 'Naruto', provider: 'c' })]);
    expect(out.length).toBe(2);
    expect(out[0].provider).toBe('a');
  });
});

describe('registry ordering', () => {
  it('Doronime paling dulu, Anoboy paling akhir', () => {
    const ids = orderedProviders('doronime').map(p => p.id);
    expect(ids[0]).toBe('doronime');
    expect(ids[ids.length - 1]).toBe('anoboy');
  });

  it('sumber unduhan murni tidak ikut streaming', () => {
    const ids = streamingProviders().map(p => p.id);
    expect(ids).not.toContain('moenime');
    expect(ids).not.toContain('alqanime');
    expect(ids).not.toContain('animekuonline');
  });

  it('downloadProviders menyertakan sumber unduhan', () => {
    const ids = downloadProviders().map(p => p.id);
    expect(ids).toContain('moenime');
    expect(ids).toContain('kusonime');
    expect(ids).toContain('samehadakuhow');
  });

  it('semua provider terdaftar lengkap', () => {
    expect(allProviders().length).toBe(19);
  });
});

describe('FallbackEngine.summary', () => {
  it('menjelaskan perpindahan provider', () => {
    const attempts = [
      { provider: 'doronime', ok: false, error: 'x', ms: 1 },
      { provider: 'ylnime', ok: true, ms: 2 }
    ];
    expect(FallbackEngine.summary('ylnime', attempts)).toContain('ylnime');
    expect(FallbackEngine.summary('doronime', attempts)).toBe('');
    expect(FallbackEngine.summary(null, attempts)).toContain('gagal');
  });
});

describe('DownloadAggregator.pickBestCard', () => {
  it('memilih kartu judul paling cocok', () => {
    const cards = [
      card({ title: 'One Piece', provider: 'a' }),
      card({ title: 'Bleach', provider: 'b' })
    ];
    expect(pickBestCard(cards, 'one piece')?.provider).toBe('a');
  });

  it('menolak kandidat yang terlalu beda', () => {
    const cards = [card({ title: 'Naruto Shippuden', provider: 'a' })];
    expect(pickBestCard(cards, 'Detective Conan')).toBeNull();
  });
});

describe('autoProviderId', () => {
  it('mengembalikan provider streaming berprioritas tertinggi', () => {
    expect(autoProviderId()).toBe(streamingProviders()[0].id);
    expect(autoProviderId()).toBe('doronime');
  });
});
