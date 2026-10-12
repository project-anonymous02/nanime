import { describe, it, expect } from 'vitest';
import { sourcePath, type ScrapeTask } from '../src/core/scraper';

describe('native scraper source mapping', () => {
  const makeTask = (provider: ScrapeTask['provider'], action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
    provider, action, ...extra
  });

  it('maps Otakudesu operations to source pages', () => {
    expect(sourcePath(makeTask('otakudesu', 'home'))).toBe('/');
    expect(sourcePath(makeTask('otakudesu', 'ongoing', { page: 2 }))).toBe('/ongoing-anime/page/2/');
    expect(sourcePath(makeTask('otakudesu', 'search', { query: 'one piece' }))).toBe('/?s=one%20piece&post_type=anime');
  });

  it('maps Oploverz schedule and Kusonime source paths', () => {
    expect(sourcePath(makeTask('oploverz', 'schedule'))).toBe('/jadwal-rilis/');
    expect(sourcePath(makeTask('kusonime', 'movies', { page: 1 }))).toBe('/anime-movie-list/');
    expect(sourcePath(makeTask('kusonime', 'search', { query: 'movie' }))).toBe('/?s=movie&post_type=post');
  });
});
