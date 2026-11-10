import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackEngine } from '../src/core/services/FallbackEngine';
import { getProvider } from '../src/providers/registry';

const extractorMock = vi.hoisted(() => ({ resolveMediaUrl: vi.fn() }));

vi.mock('../src/core/services/StreamExtractor', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/core/services/StreamExtractor')>();
  return { ...actual, resolveMediaUrl: extractorMock.resolveMediaUrl };
});

type Route = (init?: RequestInit) => Response;

function stubFetch(routes: Record<string, Route>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || 'GET').toUpperCase();
    const route = routes[`${method} ${url}`] ?? routes[url];
    if (!route) throw new TypeError('unexpected fetch ' + method + ' ' + url);
    return route(init);
  }));
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function hls(): Response {
  return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
}

function mp4Bytes(): Response {
  return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), {
    status: 206,
    headers: { 'content-type': 'video/mp4' }
  });
}

function providerStream(playerUrl: string, servers: { name: string; id: string }[] = []) {
  const provider = getProvider('otakudesu');
  if (!provider) throw new Error('Otakudesu provider fixture missing');
  return {
    provider,
    stub: vi.spyOn(provider, 'stream').mockResolvedValue({
      provider: provider.id,
      title: 'Server 1',
      playerUrl,
      qualities: [],
      servers: servers.map((server, index) => ({ ...server, def: index === 0 })),
      downloads: [],
      info: {}
    })
  };
}

async function resolveOne(episodeId: string) {
  return FallbackEngine.resolveAll([{
    provider: 'otakudesu',
    params: { animeId: 'test-anime', episodeId }
  }], { max: 1, timeout: 2000 });
}

beforeEach(() => {
  extractorMock.resolveMediaUrl.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FallbackEngine media classification', () => {
  it('extracts direct media from a 200 HTML page before keeping the iframe', async () => {
    providerStream('https://embed.test/watch/classify-1');
    extractorMock.resolveMediaUrl.mockResolvedValue({ url: 'https://cdn.test/master.m3u8', kind: 'file' });
    stubFetch({
      'HEAD https://embed.test/watch/classify-1': () => html('<html><body>player</body></html>'),
      'HEAD https://cdn.test/master.m3u8': () => hls(),
      'GET https://cdn.test/master.m3u8': () => hls()
    });

    const result = await resolveOne('classify-1');

    expect(extractorMock.resolveMediaUrl).toHaveBeenCalledWith('https://embed.test/watch/classify-1');
    expect(result.results).toHaveLength(1);
    const stream = result.results[0].stream;
    expect(stream.sourceKind).toBe('direct-media');
    expect(stream.playerUrl).toBe('https://cdn.test/master.m3u8');
    expect(stream.servers[0].kind).toBe('file');
  });

  it('keeps the iframe only when extraction finds no media', async () => {
    providerStream('https://embed.test/watch/classify-2');
    extractorMock.resolveMediaUrl.mockResolvedValue({ url: 'https://embed.test/watch/classify-2', kind: 'embed' });
    stubFetch({
      'HEAD https://embed.test/watch/classify-2': () => html('<html><body>player</body></html>')
    });

    const result = await resolveOne('classify-2');

    expect(result.results[0].stream.sourceKind).toBe('embed-page');
    expect(result.results[0].stream.playerUrl).toBe('https://embed.test/watch/classify-2');
    expect(result.results[0].stream.servers[0].kind).toBe('embed');
  });

  it('verifies a file URL with a ranged GET when HEAD is rejected', async () => {
    providerStream('https://cdn.test/video-403.mp4');
    stubFetch({
      'HEAD https://cdn.test/video-403.mp4': () => new Response(null, { status: 403 }),
      'GET https://cdn.test/video-403.mp4': () => mp4Bytes()
    });

    const result = await resolveOne('classify-3');

    const stream = result.results[0].stream;
    expect(stream.sourceKind).toBe('direct-media');
    expect(stream.playerUrl).toBe('https://cdn.test/video-403.mp4');
    expect(stream.servers[0].kind).toBe('file');
  });

  it('records the classification per server in a mixed bundle', async () => {
    providerStream('https://cdn.test/mixed.mp4', [
      { name: 'Direct', id: 'https://cdn.test/mixed.mp4' },
      { name: 'Embed', id: 'https://embed.test/watch/classify-4' }
    ]);
    extractorMock.resolveMediaUrl.mockResolvedValue({ url: 'https://embed.test/watch/classify-4', kind: 'embed' });
    stubFetch({
      'HEAD https://cdn.test/mixed.mp4': () => new Response(null, { status: 206, headers: { 'content-type': 'video/mp4' } }),
      'HEAD https://embed.test/watch/classify-4': () => html('<html></html>')
    });

    const result = await resolveOne('classify-4');

    const stream = result.results[0].stream;
    expect(stream.sourceKind).toBe('direct-media');
    expect(stream.servers.map(server => server.kind)).toEqual(['file', 'embed']);
  });
});
