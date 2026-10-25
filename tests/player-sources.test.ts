// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { playableSourcesFrom } from '../src/ui/PlayerOverlay';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { usePlayer } from '../src/state/player';
import { ErrorBoundary } from '../src/shell/ErrorBoundary';
import type { StreamBundle } from '../src/core/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('player stream rendering guards', () => {
  it('handles malformed or older cached source collections without crashing', () => {
    const stream = {
      qualities: { oldFormat: true },
      servers: [null, { url: 'https://embed.test/watch', label: 'Server A', providerRef: 'otakudesu' }]
    } as unknown as Partial<StreamBundle>;

    expect(playableSourcesFrom(stream)).toEqual([{
      label: 'Server A',
      provider: 'otakudesu',
      url: 'https://embed.test/watch',
      kind: 'embed'
    }]);
  });

  it('ignores unusable and duplicate URLs from provider data', () => {
    const stream = {
      qualities: [{ label: '720p', source: { url: 'https://embed.test/watch', providerRef: 'otakudesu', kind: 'embed' } }],
      servers: [{ url: 'https://embed.test/watch', label: 'Duplicate', providerRef: 'otakudesu' }, { url: 'javascript:alert(1)' }]
    } as unknown as Partial<StreamBundle>;

    expect(playableSourcesFrom(stream)).toEqual([{
      label: '720p',
      provider: 'otakudesu',
      url: 'https://embed.test/watch',
      kind: 'embed',
      quality: '720p'
    }]);
  });

  it('keeps mirror names separate from their quality labels', () => {
    const stream = {
      sourceKind: 'embed-page',
      qualities: [],
      servers: [
        { url: 'https://mirror.test/mega', label: 'Mega', quality: '360p', providerRef: 'otakudesu' },
        { url: 'https://mirror.test/vidhide', label: 'Vidhide', quality: '360p', providerRef: 'otakudesu' },
        { url: 'https://mirror.test/other', label: 'Streamtape', quality: '480p', providerRef: 'otakudesu' }
      ]
    } as unknown as Partial<StreamBundle>;

    expect(playableSourcesFrom(stream).map(source => [source.quality, source.label])).toEqual([
      ['360p', 'Mega'], ['360p', 'Vidhide'], ['480p', 'Streamtape']
    ]);
  });

  it('keeps the player usable when provider arrays exist but every playback URL is invalid', async () => {
    const request = usePlayer.getState().start({
      animeId: 'test-anime',
      title: 'Test Anime',
      poster: '',
      episode: '1',
      retry: () => undefined,
      onProgress: () => undefined
    });
    usePlayer.getState().update(request, {
      loading: false,
      stream: {
        qualities: [{ label: '720p', source: { url: 'javascript:alert(1)', providerRef: 'test', kind: 'file', exact: true } }],
        servers: [{ ref: 'test:main', label: 'Server', url: 'javascript:alert(1)', providerRef: 'test', isDefault: true }]
      } as unknown as StreamBundle
    });
    expect(usePlayer.getState().session?.request).toBe(request);

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ErrorBoundary, null,
        createElement(MemoryRouter, null, createElement(PlayerOverlay))));
    });
    expect(host.textContent).toContain('Sumber video tidak valid atau tidak tersedia');
    expect(host.textContent).toContain('Coba lagi');
    expect(host.textContent).not.toContain('Terjadi kendala');
    await act(async () => root.unmount());
    usePlayer.getState().close();
  });
});
