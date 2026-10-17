import { afterEach, describe, expect, it, vi } from 'vitest';
import { Catalog } from '../src/core/services/Catalog';
import { DownloadAggregator } from '../src/core/services/DownloadAggregator';
import { TitleIndex } from '../src/core/services/TitleIndex';
import { getProvider } from '../src/providers/registry';
import type { EpisodeStream } from '../src/core/types';

let serial = 0;

async function setupProvider(streamImpl?: (episodeId: string) => Promise<EpisodeStream>) {
  vi.spyOn(DownloadAggregator, 'collect').mockResolvedValue({ links: [], byProvider: [] });
  const id = `stream-episode-test-${++serial}`;
  const episodeId = (n: number) => `${id}-episode-id-${n}`;
  const provider = getProvider('doronime');
  if (!provider) throw new Error('Provider fixture missing');
  await TitleIndex.upsert({
    id,
    title: 'Episode test',
    sources: [{ provider: provider.id, id: `${id}-source`, slug: id, episodes: [1, 2, 3].map(n => ({ num: String(n), id: episodeId(n), slug: `${id}-episode-${n}` })) }]
  });
  const streamSpy = vi.spyOn(provider, 'stream').mockImplementation(async params => {
    const requestedEpisodeId = params.episodeId;
    if (streamImpl) return streamImpl(requestedEpisodeId);
    return {
      provider: provider.id,
      title: `episode ${requestedEpisodeId}`,
      playerUrl: `https://media.test/${requestedEpisodeId}.mp4`,
      qualities: [],
      servers: [],
      downloads: [],
      info: { episodeId: requestedEpisodeId }
    };
  });
  return { id, streamSpy };
}

afterEach(() => vi.restoreAllMocks());

describe('Catalog.stream episode identity', () => {
  it('resolves episode IDs across forward and backward selection, not just the visible number', async () => {
    const { id, streamSpy } = await setupProvider();
    for (const n of [1, 2, 3, 1]) {
      const expectedId = `${id}-episode-id-${n}`;
      const result = await Catalog.stream(id, String(n), {
        episodeProvider: 'doronime',
        episodeId: expectedId,
        episodeSlug: `${id}-episode-${n}`
      });
      expect(result.servers[0].url).toBe(`https://media.test/${expectedId}.mp4`);
    }
    expect(streamSpy.mock.calls.map(([params]) => params.episodeId)).toEqual([1, 2, 3].map(n => `${id}-episode-id-${n}`));
  });

  it('keeps distinct in-flight episode responses associated with their requested IDs', async () => {
    let finishEpisode2!: () => void;
    const waitForEpisode2 = new Promise<void>(resolve => { finishEpisode2 = resolve; });
    const { id, streamSpy } = await setupProvider(async episodeId => {
      if (episodeId === `${id}-episode-id-2`) await waitForEpisode2;
      return {
        provider: 'doronime',
        title: episodeId,
        playerUrl: `https://media.test/${episodeId}.mp4`,
        qualities: [], servers: [], downloads: [], info: { episodeId }
      };
    });
    const episode2Id = `${id}-episode-id-2`;
    const episode3Id = `${id}-episode-id-3`;
    const episode2 = Catalog.stream(id, '2', { episodeProvider: 'doronime', episodeId: episode2Id });
    await vi.waitFor(() => expect(streamSpy.mock.calls.some(([params]) => params.episodeId === episode2Id)).toBe(true));
    const episode3 = await Catalog.stream(id, '3', { episodeProvider: 'doronime', episodeId: episode3Id });
    finishEpisode2();
    const lateEpisode2 = await episode2;
    expect(episode3.servers[0].url).toBe(`https://media.test/${episode3Id}.mp4`);
    expect(lateEpisode2.servers[0].url).toBe(`https://media.test/${episode2Id}.mp4`);
  });

  it('fails instead of returning a source when the requested provider fails', async () => {
    const { id } = await setupProvider(async () => { throw new Error('media unavailable'); });
    await expect(Catalog.stream(id, '2', {
      episodeProvider: 'doronime', episodeId: `${id}-episode-id-2`, episodeSlug: `${id}-episode-2`
    })).rejects.toThrow();
  });
});

