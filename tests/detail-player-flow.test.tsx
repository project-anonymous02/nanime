// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Detail } from '../src/views/Detail';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { ErrorBoundary } from '../src/shell/ErrorBoundary';
import { usePlayer } from '../src/state/player';

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
  episodeList: [{ num: '1', id: 'episode-1', slug: 'episode-1', date: '', sources: [{ provider: 'otakudesu', id: 'episode-1', slug: 'episode-1' }] }],
  recommendations: []
};

const streamBundle = {
  id: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
  qualities: [{ label: '720p', source: { url: 'https://embed.test/watch', providerRef: 'otakudesu', label: '720p', kind: 'embed', exact: true } }],
  defaultQuality: '720p', servers: [], downloads: [], synopsis: '', sourceCount: 1,
  availability: 'external-embed', sourceKind: 'embed-page'
} as const;

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
});
