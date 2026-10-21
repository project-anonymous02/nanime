import { describe, it, expect } from 'vitest';
import { sourcePath, type ScrapeTask } from '../src/core/scraper';

describe('native scraper source mapping', () => {
  const makeTask = (action: ScrapeTask['action'], extra: Partial<ScrapeTask> = {}): ScrapeTask => ({
    provider: 'otakudesu', action, ...extra
  });

  it('maps Otakudesu operations to source pages', () => {
    expect(sourcePath(makeTask('home'))).toBe('/');
    expect(sourcePath(makeTask('ongoing', { page: 2 }))).toBe('/ongoing-anime/page/2/');
    expect(sourcePath(makeTask('search', { query: 'one piece' }))).toBe('/?s=one%20piece&post_type=anime');
    expect(sourcePath(makeTask('detail', { id: 'boruto' }))).toBe('/anime/boruto/');
    expect(sourcePath(makeTask('episode', { id: 'boruto-episode-1' }))).toBe('/episode/boruto-episode-1/');
  });
});
