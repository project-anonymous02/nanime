// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Detail } from '../src/views/Detail';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { ErrorBoundary } from '../src/shell/ErrorBoundary';
import { usePlayer } from '../src/state/player';
import type { StreamBundle } from '../src/core/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogMocks = vi.hoisted(() => ({
  detail: vi.fn(),
  stream: vi.fn()
}));

vi.mock('../src/core/services/Catalog', () => ({
  Catalog: { detail: catalogMocks.detail, stream: catalogMocks.stream }
}));
vi.mock('../src/core/services/Telemetry', () => ({ recordClientMetric: vi.fn() }));

const detailBundle = {
  id: 'test-anime', providers: ['otakudesu'], title: 'Test Anime', alt: '', poster: '', score: '',
  type: 'TV', status: 'Selesai', year: '', episodes: '1', duration: '', studio: '', genres: [],
  synopsis: '', sourceCount: 1,
  episodeList: [
    { num: '1', id: 'episode-1', slug: 'episode-1', date: '', sources: [{ provider: 'otakudesu', id: 'episode-1', slug: 'episode-1' }] },
    { num: '2', id: 'episode-2', slug: 'episode-2', date: '', sources: [{ provider: 'otakudesu', id: 'episode-2', slug: 'episode-2' }] }
  ],
  recommendations: []
};

const streamBundle: StreamBundle = {
  id: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
  qualities: [{ label: '720p', source: { url: 'https://embed.test/watch', providerRef: 'otakudesu', label: '720p', kind: 'embed', exact: true }, approx: false }],
  defaultQuality: '720p', servers: [], downloads: [], synopsis: '', sourceCount: 1,
  availability: 'external-embed', sourceKind: 'embed-page'
};

describe('detail to player flow', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    usePlayer.getState().close();
    vi.clearAllMocks();
  });

  it('opens an episode from Detail and renders the provider embed without a page error', async () => {
    catalogMocks.detail.mockResolvedValue(detailBundle);
    catalogMocks.stream.mockResolvedValue(streamBundle);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime?title=Test%20Anime'] },
          createElement(Routes, null,
            createElement(Route, {
              path: '/detail/:id',
              element: createElement(Fragment, null, createElement(Detail), createElement(PlayerOverlay))
            })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const playButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Tonton Sekarang'));
    expect(playButton).toBeTruthy();
    await act(async () => {
      playButton?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(catalogMocks.stream).toHaveBeenCalledWith('test-anime', '1', expect.objectContaining({
      title: 'Test Anime', episodeProvider: 'otakudesu', episodeId: 'episode-1'
    }));
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('https://embed.test/watch');
    expect(host.textContent).not.toContain('Terjadi kendala');
  });

  it('does not replay the deep-linked episode after the user selects another episode', async () => {
    catalogMocks.detail.mockResolvedValue(detailBundle);
    catalogMocks.stream.mockImplementation(async (_id: string, episode: string) => ({
      ...streamBundle,
      episode,
      qualities: [{
        label: '720p',
        approx: false,
        source: { url: `https://embed.test/watch/${episode}`, providerRef: 'otakudesu', label: '720p', kind: 'embed', exact: true }
      }]
    }));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime?title=Test%20Anime&episode=1'] },
          createElement(Routes, null,
            createElement(Route, {
              path: '/detail/:id',
              element: createElement(Fragment, null, createElement(Detail), createElement(PlayerOverlay))
            })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(usePlayer.getState().session?.episode).toBe('1');

    const episodeTwo = host.querySelector<HTMLButtonElement>('button[aria-label="Putar episode 2"]');
    expect(episodeTwo).toBeTruthy();
    await act(async () => {
      episodeTwo?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(catalogMocks.stream.mock.calls.map(([_, episode]) => episode)).toEqual(['1', '2']);
    expect(usePlayer.getState().session?.episode).toBe('2');
    expect(host.textContent).not.toContain('Terjadi kendala');
  });

  it('shows a retry after detail load fails, then renders the detail when retry succeeds', async () => {
    catalogMocks.detail.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(detailBundle);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime'] },
          createElement(Routes, null,
            createElement(Route, { path: '/detail/:id', element: createElement(Detail) })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain('Tidak bisa memuat');
    expect(host.textContent).not.toContain('Terjadi kendala');

    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Coba lagi'));
    await act(async () => {
      retry?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain('Tonton Sekarang');
    expect(catalogMocks.detail).toHaveBeenCalledTimes(2);
  });

  it('keeps detail stable when the requested episode is absent or the anime has no episodes', async () => {
    catalogMocks.detail.mockResolvedValue({ ...detailBundle, episodeList: [] });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime?episode=99'] },
          createElement(Routes, null,
            createElement(Route, { path: '/detail/:id', element: createElement(Detail) })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const play = host.querySelector<HTMLButtonElement>('.hn-detail-actions .hn-btn');
    expect(play?.disabled).toBe(true);
    expect(catalogMocks.stream).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Terjadi kendala');
  });

  it('shows a stream error in the player and allows retry without replacing the page', async () => {
    catalogMocks.detail.mockResolvedValue(detailBundle);
    catalogMocks.stream.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValue(streamBundle);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime'] },
          createElement(Routes, null,
            createElement(Route, {
              path: '/detail/:id',
              element: createElement(Fragment, null, createElement(Detail), createElement(PlayerOverlay))
            })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const play = host.querySelector<HTMLButtonElement>('button[aria-label="Putar episode 1"]');
    await act(async () => {
      play?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain('provider unavailable');
    expect(host.textContent).not.toContain('Terjadi kendala');

    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Coba lagi'));
    await act(async () => {
      retry?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('https://embed.test/watch');
    expect(host.textContent).not.toContain('Terjadi kendala');
  });

  it('ignores a slow stream response after another episode has already been selected', async () => {
    catalogMocks.detail.mockResolvedValue(detailBundle);
    let resolveFirst!: (value: StreamBundle) => void;
    let resolveSecond!: (value: StreamBundle) => void;
    const first = new Promise<StreamBundle>(resolve => { resolveFirst = resolve; });
    const second = new Promise<StreamBundle>(resolve => { resolveSecond = resolve; });
    catalogMocks.stream.mockImplementation((_id: string, episode: string) => episode === '1' ? first : second);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, { initialEntries: ['/detail/test-anime'] },
          createElement(Routes, null,
            createElement(Route, {
              path: '/detail/:id',
              element: createElement(Fragment, null, createElement(Detail), createElement(PlayerOverlay))
            })
          )
        )
      ));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="Putar episode 1"]')?.click();
      host?.querySelector<HTMLButtonElement>('button[aria-label="Putar episode 2"]')?.click();
    });
    await act(async () => {
      resolveSecond({
        ...streamBundle,
        episode: '2',
        qualities: [{
          label: '720p', approx: false,
          source: { url: 'https://embed.test/watch/2', providerRef: 'otakudesu', label: '720p', kind: 'embed', exact: true }
        }]
      });
      await second;
    });
    await act(async () => {
      resolveFirst({ ...streamBundle, episode: '1' });
      await first;
    });

    expect(usePlayer.getState().session?.episode).toBe('2');
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('https://embed.test/watch/2');
    expect(host.textContent).not.toContain('Terjadi kendala');
  });
});
