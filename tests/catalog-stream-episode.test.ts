import { afterEach, describe, expect, it, vi } from 'vitest';
import { Catalog } from '../src/core/services/Catalog';
import { DownloadAggregator } from '../src/core/services/DownloadAggregator';
import { TitleIndex } from '../src/core/services/TitleIndex';
import { getProvider } from '../src/providers/registry';
import type { Detail, EpisodeStream } from '../src/core/types';

let serial = 0;

async function setupProvider(streamImpl?: (episodeId: string) => Promise<EpisodeStream>) {
  vi.spyOn(DownloadAggregator, 'collect').mockResolvedValue({ links: [], byProvider: [] });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(null, {
    status: 200,
    headers: { 'content-type': 'video/mp4' }
  })));
  const id = `stream-episode-test-${++serial}`;
  const episodeId = (n: number) => `${id}-episode-id-${n}`;
  const provider = getProvider('otakudesu');
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

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Catalog.stream episode identity', () => {
  it('resolves episode IDs across forward and backward selection, not just the visible number', async () => {
    const { id, streamSpy } = await setupProvider();
    for (const n of [1, 2, 3, 1]) {
      const expectedId = `${id}-episode-id-${n}`;
      const result = await Catalog.stream(id, String(n), {
        episodeProvider: 'otakudesu',
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
        provider: 'otakudesu',
        title: episodeId,
        playerUrl: `https://media.test/${episodeId}.mp4`,
        qualities: [], servers: [], downloads: [], info: { episodeId }
      };
    });
    const episode2Id = `${id}-episode-id-2`;
    const episode3Id = `${id}-episode-id-3`;
    const episode2 = Catalog.stream(id, '2', { episodeProvider: 'otakudesu', episodeId: episode2Id });
    await vi.waitFor(() => expect(streamSpy.mock.calls.some(([params]) => params.episodeId === episode2Id)).toBe(true));
    const episode3 = await Catalog.stream(id, '3', { episodeProvider: 'otakudesu', episodeId: episode3Id });
    finishEpisode2();
    const lateEpisode2 = await episode2;
    expect(episode3.servers[0].url).toBe(`https://media.test/${episode3Id}.mp4`);
    expect(lateEpisode2.servers[0].url).toBe(`https://media.test/${episode2Id}.mp4`);
  });

  it('re-matches by episode number when cached provider episode IDs have gone stale', async () => {
    const { id, streamSpy } = await setupProvider();
    const provider = getProvider('otakudesu')!;
    const freshEpisodeId = `${id}-fresh-episode-1`;
    await TitleIndex.upsert({
      id,
      title: 'Episode test',
      sources: [{
        provider: provider.id,
        id: `${id}-source`,
        slug: id,
        episodes: [{ num: '1', id: `${id}-stale-index-id`, slug: `${id}-stale-index-slug` }]
      }]
    });
    vi.spyOn(provider, 'detail').mockResolvedValue({
      id: `${id}-source`, slug: id, provider: provider.id, title: 'Episode test', alt: '',
      poster: 'https://img.test/episode-test.jpg', score: '8', type: 'TV', status: 'Ongoing',
      year: '2026', episodes: '1', duration: '24 min', studio: 'Studio',
      genres: [{ t: 'Drama', id: 'drama' }], synopsis: 'Sinopsis tersedia.', downloads: [],
      episodeList: [{ num: '1', id: freshEpisodeId, slug: freshEpisodeId, date: '' }],
      recommendations: []
    } satisfies Detail);
    streamSpy.mockImplementation(async params => {
      if (params.episodeId !== freshEpisodeId) throw new Error('Episode provider lama');
      return {
        provider: provider.id, title: 'Episode 1', playerUrl: `https://media.test/${freshEpisodeId}.mp4`,
        qualities: [], servers: [], downloads: [], info: {}
      };
    });

    const result = await Catalog.stream(id, '1', {
      episodeProvider: provider.id,
      episodeId: `${id}-stale-ui-id`,
      episodeSlug: `${id}-stale-ui-slug`
    });

    expect(streamSpy).toHaveBeenCalledWith(expect.objectContaining({ episodeId: freshEpisodeId }));
    expect(result.availability).toBe('direct-media');
    expect(result.servers[0]?.url).toBe(`https://media.test/${freshEpisodeId}.mp4`);
  });

  it('uses the indexed fallback provider when the primary provider has no stream', async () => {
    const { id, streamSpy } = await setupProvider(async () => { throw new Error('primary stream unavailable'); });
    const fallback = getProvider('samehadaku')!;
    const fallbackEpisodeId = `${id}-samehadaku-episode-2`;
    await TitleIndex.upsert({
      id,
      title: 'Episode test',
      sources: [
        { provider: 'otakudesu', id: `${id}-ota`, slug: id, episodes: [{ num: '2', id: `${id}-ota-episode-2`, slug: 'episode-2' }] },
        { provider: 'samehadaku', id: `${id}-sama`, slug: id, episodes: [{ num: '2', id: fallbackEpisodeId, slug: fallbackEpisodeId }] }
      ]
    });
    const fallbackStream = vi.spyOn(fallback, 'stream').mockResolvedValue({
      provider: fallback.id, title: 'Episode 2', playerUrl: `https://media.test/${fallbackEpisodeId}.mp4`,
      qualities: [], servers: [], downloads: [], info: {}
    });

    const result = await Catalog.stream(id, '2', {
      episodeProvider: 'otakudesu', episodeId: `${id}-ota-episode-2`
    });

    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(fallbackStream).toHaveBeenCalledWith(expect.objectContaining({ episodeId: fallbackEpisodeId }));
    expect(result.availability).toBe('direct-media');
    expect(result.servers[0]?.url).toBe(`https://media.test/${fallbackEpisodeId}.mp4`);
  });

  it('keeps the primary embed playable when an episode has more than eight opaque mirror IDs', async () => {
    const animeId = 'fx-senshi-kurumi-sub-indo';
    const provider = getProvider('otakudesu')!;
    const episodeId = 'fxskc-episode-4-sub-indo';
    const playerUrl = 'https://desustream.net/dstream/odcdn/?id=valid-episode-embed';
    const serverIds = Array.from({ length: 9 }, (_, i) => `opaque-server-${i + 1}`);
    await TitleIndex.upsert({
      id: animeId,
      title: 'FX Senshi Kurumi-chan',
      sources: [{ provider: provider.id, id: 'fx-senshi-kurumi-sub-indo', slug: 'fx-senshi-kurumi-sub-indo', episodes: [
        { num: '4', id: episodeId, slug: '', title: 'FX Senshi Kurumi-chan Episode 4' }
      ] }]
    });
    vi.spyOn(provider, 'stream').mockResolvedValue({
      provider: provider.id,
      title: 'FX Senshi Kurumi-chan Episode 4',
      playerUrl,
      qualities: ['360p', '480p', '720p'].map((quality, qualityIndex) => ({
        title: quality,
        servers: serverIds.slice(qualityIndex * 3, qualityIndex * 3 + 3).map((serverId, i) => ({
          name: `Mirror ${qualityIndex * 3 + i + 1}`, id: serverId, def: i === 0
        }))
      })),
      servers: serverIds.map((serverId, i) => ({ name: `Mirror ${i + 1}`, id: serverId, quality: i < 2 ? '360p' : i < 5 ? '480p' : '720p', def: i === 0 })),
      downloads: [],
      info: {}
    });
    const providerWithResolver = provider as typeof provider & { resolveServer: (serverId: string) => Promise<string> };
    const resolveServer = vi.spyOn(providerWithResolver, 'resolveServer').mockImplementation(async () => new Promise<string>(() => {}));
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'text/html' } });
      throw new Error('iframe page should not be fetched as a video file');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await Catalog.stream(animeId, '4', {
      title: 'FX Senshi Kurumi-chan', episodeProvider: provider.id, episodeId
    });

    expect(resolveServer).not.toHaveBeenCalled();
    expect(result.availability).toBe('external-embed');
    expect(result.servers.some(server => server.url === playerUrl)).toBe(true);
    expect(fetchSpy.mock.calls.every(([, init]) => init?.method === 'HEAD')).toBe(true);
  });

  it('reports unavailable rather than turning a download/error URL into playback', async () => {
    const { id } = await setupProvider(async () => { throw new Error('media unavailable'); });
    const result = await Catalog.stream(id, '2', {
      episodeProvider: 'otakudesu', episodeId: `${id}-episode-id-2`, episodeSlug: `${id}-episode-2`
    });
    expect(result.availability).toBe('unavailable');
    expect(result.qualities).toEqual([]);
    expect(result.servers).toEqual([]);
  });

  it('groups only http download links exposed by the episode page', async () => {
    const { id } = await setupProvider(async episodeId => ({
      provider: 'otakudesu',
      title: `episode ${episodeId}`,
      playerUrl: `https://media.test/${episodeId}.mp4`,
      qualities: [],
      servers: [],
      info: {},
      downloads: [
        { quality: '720p', name: 'A', url: 'https://dl.test/a' },
        { quality: '720p', name: 'A duplicate', url: 'https://dl.test/a' },
        { quality: '1080p', name: 'Broken', url: 'javascript:alert(1)' },
        { quality: '1080p', name: 'C', url: 'https://dl.test/c' }
      ]
    }));
    const result = await Catalog.stream(id, '1', {
      episodeProvider: 'otakudesu', episodeId: `${id}-episode-id-1`, episodeSlug: `${id}-episode-1`
    });
    expect(result.downloads.map(group => [group.quality, group.items.map(item => item.url)])).toEqual([
      ['720p', ['https://dl.test/a']],
      ['1080p', ['https://dl.test/c']]
    ]);
    expect(result.downloads.flatMap(group => group.items).every(item => item.availability === 'unverified')).toBe(true);
  });
});

