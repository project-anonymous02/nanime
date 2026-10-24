import { afterEach, describe, expect, it, vi } from 'vitest';
import { FallbackEngine } from '../src/core/services/FallbackEngine';
import { getProvider } from '../src/providers/registry';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FallbackEngine iframe fallback', () => {
  it('keeps a provider iframe when the embed host blocks the HEAD probe', async () => {
    const provider = getProvider('otakudesu');
    if (!provider) throw new Error('Otakudesu provider fixture missing');
    const embedUrl = 'https://embed.test/player/episode-1';
    vi.spyOn(provider, 'stream').mockResolvedValue({
      provider: provider.id,
      title: 'Server 1',
      playerUrl: embedUrl,
      qualities: [],
      servers: [{ name: 'Server 1', id: embedUrl, def: true }],
      downloads: [],
      info: {}
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const result = await FallbackEngine.resolveAll([{
      provider: provider.id,
      params: { animeId: 'test-anime', episodeId: 'episode-1' }
    }], { max: 1, timeout: 1000 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].stream.sourceKind).toBe('embed-page');
    expect(result.results[0].stream.playerUrl).toBe(embedUrl);
  });
});
