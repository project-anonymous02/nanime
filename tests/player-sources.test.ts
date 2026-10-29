// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { playableSourcesFrom } from '../src/ui/PlayerOverlay';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { ADAPTIVE_LOAD_TIMEOUT_MS, ADAPTIVE_STALL_TIMEOUT_MS, MEDIA_LOAD_TIMEOUT_MS, PLAYBACK_STALL_TIMEOUT_MS } from '../src/ui/AdaptiveVideo';
import { usePlayer } from '../src/state/player';
import { useSettings } from '../src/state/settings';
import { ErrorBoundary } from '../src/shell/ErrorBoundary';
import type { StreamBundle } from '../src/core/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const hlsMock = vi.hoisted(() => ({
  errorHandler: null as null | ((event: string, data: { fatal: boolean; type: string; details?: string }) => void),
  dataHandler: null as null | ((event: string, data: { fatal: boolean; type: string; details?: string }) => void),
  recoverMediaError: vi.fn(),
  destroy: vi.fn()
}));

vi.mock('hls.js', () => {
  class FakeHls {
    static isSupported(): boolean { return true; }
    static Events = {
      ERROR: 'error',
      FRAG_LOADING: 'fragLoading',
      FRAG_LOADED: 'fragLoaded',
      FRAG_BUFFERED: 'fragBuffered',
      LEVEL_LOADED: 'levelLoaded'
    };
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError', OTHER_ERROR: 'otherError' };
    on(event: string, handler: (event: string, data: { fatal: boolean; type: string; details?: string }) => void): void {
      if (event === FakeHls.Events.ERROR) hlsMock.errorHandler = handler;
      if (event === FakeHls.Events.FRAG_LOADING) hlsMock.dataHandler = handler;
    }
    loadSource(): void {}
    attachMedia(): void {}
    recoverMediaError(): void { hlsMock.recoverMediaError(); }
    destroy(): void { hlsMock.destroy(); }
  }
  return { default: FakeHls };
});

if (!Element.prototype.setPointerCapture) {
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => undefined });
}

function pointerDown(pointerType: string): MouseEvent {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

const DIRECT_STREAM: StreamBundle = {
  id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'direct-media', defaultQuality: '720p',
  qualities: [{ label: '720p', approx: false, source: { url: 'https://media.test/episode.mp4', providerRef: 'test', label: '720p', kind: 'file', exact: true } }],
  servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'direct-media'
};

const EMBED_STREAM: StreamBundle = {
  id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'embed-page', defaultQuality: '480p',
  qualities: [{ label: '480p', approx: false, source: { url: 'https://embed.test/watch', providerRef: 'test', label: '480p', kind: 'embed', exact: true } }],
  servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'external-embed'
};

async function renderPlayer(stream: StreamBundle) {
  const request = usePlayer.getState().start({
    animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
    retry: () => undefined, onProgress: () => undefined
  });
  usePlayer.getState().update(request, { loading: false, stream });
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ErrorBoundary, null,
      createElement(MemoryRouter, { initialEntries: ['/detail/test-anime'] }, createElement(PlayerOverlay))));
  });
  return { host, root };
}

const MIRROR_STREAM: StreamBundle = {
  ...DIRECT_STREAM,
  qualities: (['720p', '480p'] as const).map(label => ({
    label, approx: false,
    source: { url: `https://media.test/${label}.mp4`, providerRef: 'test', label, kind: 'file' as const, exact: true }
  }))
};

const HLS_STREAM: StreamBundle = {
  ...DIRECT_STREAM,
  qualities: [
    { label: '720p', approx: false, source: { url: 'https://media.test/hls.m3u8', providerRef: 'test', label: '720p', kind: 'file', exact: true } },
    { label: '480p', approx: false, source: { url: 'https://media.test/480p.mp4', providerRef: 'test', label: '480p', kind: 'file', exact: true } }
  ]
};

function markPlaying(video: HTMLVideoElement, currentTime = 0): void {
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: currentTime });
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  Object.defineProperty(video, 'ended', { configurable: true, value: false });
}

async function waitForHlsAttach(): Promise<void> {
  for (let i = 0; i < 5 && !hlsMock.errorHandler; i++) {
    await act(async () => { await Promise.resolve(); });
  }
  expect(hlsMock.errorHandler).not.toBeNull();
}

describe('player stream rendering guards', () => {
  afterEach(() => {
    hlsMock.errorHandler = null;
    hlsMock.dataHandler = null;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    useSettings.getState().reset();
    usePlayer.getState().close();
  });

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

  it('attempts autoplay when a direct stream becomes playable', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const request = usePlayer.getState().start({
      animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
      retry: () => undefined, onProgress: () => undefined
    });
    usePlayer.getState().update(request, {
      loading: false,
      stream: {
        id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'direct-media', defaultQuality: '720p',
        qualities: [{ label: '720p', approx: false, source: { url: 'https://media.test/episode.mp4', providerRef: 'test', label: '720p', kind: 'file', exact: true } }],
        servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'direct-media'
      }
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(MemoryRouter, null, createElement(PlayerOverlay))));
    });
    const video = host.querySelector('video');
    expect(video?.autoplay).toBe(true);
    await act(async () => {
      video?.dispatchEvent(new Event('canplay', { bubbles: true }));
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('falls back to muted autoplay when the browser blocks playback with sound', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
      .mockResolvedValue(undefined);
    const request = usePlayer.getState().start({
      animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
      retry: () => undefined, onProgress: () => undefined
    });
    usePlayer.getState().update(request, {
      loading: false,
      stream: {
        id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'direct-media', defaultQuality: '720p',
        qualities: [{ label: '720p', approx: false, source: { url: 'https://media.test/episode.mp4', providerRef: 'test', label: '720p', kind: 'file', exact: true } }],
        servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'direct-media'
      }
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(createElement(ErrorBoundary, null, createElement(MemoryRouter, null, createElement(PlayerOverlay)))));
    const video = host.querySelector('video');
    await act(async () => {
      video?.dispatchEvent(new Event('canplay', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(video?.muted).toBe(true);
    expect(host.textContent).toContain('Aktifkan suara');
    const soundButton = host.querySelector('button.player-status-action');
    expect(soundButton?.textContent).toBe('Aktifkan suara');
    await act(async () => {
      (soundButton as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(video?.muted).toBe(false);
    await act(async () => root.unmount());
  });

  it('skips the configured intro time on direct video time updates', async () => {
    useSettings.getState().patch({ skipIntro: true, introDuration: 85 });
    const progress = vi.fn();
    const request = usePlayer.getState().start({
      animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
      retry: () => undefined, onProgress: progress
    });
    usePlayer.getState().update(request, {
      loading: false,
      stream: {
        id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'direct-media', defaultQuality: '720p',
        qualities: [{ label: '720p', approx: false, source: { url: 'https://media.test/episode.mp4', providerRef: 'test', label: '720p', kind: 'file', exact: true } }],
        servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'direct-media'
      }
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(MemoryRouter, null, createElement(PlayerOverlay))));
    });
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 20 });
    await act(async () => video.dispatchEvent(new Event('timeupdate', { bubbles: true })));
    expect(video.currentTime).toBe(85);
    expect(progress).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('sandbox iframe sources to block popups and top-level redirects', async () => {
    const request = usePlayer.getState().start({
      animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
      retry: () => undefined, onProgress: () => undefined
    });
    usePlayer.getState().update(request, {
      loading: false,
      stream: {
        id: 'test-anime', title: 'Test Anime', poster: '', episode: '1', sourceKind: 'embed-page', defaultQuality: '480p',
        qualities: [{ label: '480p', approx: false, source: { url: 'https://embed.test/watch', providerRef: 'test', label: '480p', kind: 'embed', exact: true } }],
        servers: [], downloads: [], synopsis: '', sourceCount: 1, availability: 'external-embed'
      }
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(createElement(ErrorBoundary, null, createElement(MemoryRouter, null, createElement(PlayerOverlay)))));
    expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-presentation');
    expect((host.querySelector('.episode-player-video') as HTMLElement | null)?.style.touchAction).toBe('');
    await act(async () => root.unmount());
  });

  it('keeps control layers transparent to hits while their buttons stay clickable', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');
    expect(css).toMatch(/\.episode-player-backdrop:not\(\.mini\) \.player-controls \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.episode-player-backdrop:not\(\.mini\) \.player-controls button[^{]*\{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.player-status-action \{[^}]*pointer-events: auto/);
  });

  it('toggles direct video playback when the video surface is tapped', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const surface = host.querySelector('.episode-player-video') as HTMLElement;
    await act(async () => {
      surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('does not double-trigger playback when tapping the play control', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const button = host.querySelector('button[aria-label="Putar video"]') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('does not skip a fallback source when the same media reports errors twice', async () => {
    const { host, root } = await renderPlayer({
      ...DIRECT_STREAM,
      qualities: (['1080p', '720p', '480p'] as const).map(label => ({
        label, approx: false,
        source: { url: `https://media.test/${label}.mp4`, providerRef: 'test', label, kind: 'file' as const, exact: true }
      }))
    });
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    await act(async () => {
      video.dispatchEvent(new Event('error'));
      video.dispatchEvent(new Event('error'));
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('does not resume a paused video when canplay fires again', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    await act(async () => {
      video.dispatchEvent(new Event('canplay'));
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => {
      video.dispatchEvent(new Event('canplay'));
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('moves to the next mirror when a direct source hangs without producing data', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer({
      ...DIRECT_STREAM,
      qualities: (['720p', '480p'] as const).map(label => ({
        label, approx: false,
        source: { url: `https://media.test/${label}.mp4`, providerRef: 'test', label, kind: 'file' as const, exact: true }
      }))
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(MEDIA_LOAD_TIMEOUT_MS); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    expect(usePlayer.getState().session?.error).toBe('');
    expect(host.querySelector('video')?.getAttribute('src')).toBe('https://media.test/480p.mp4');
    await act(async () => root.unmount());
  });

  it('does not abandon a direct source that reaches playable data in time', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const video = host.querySelector('video');
    await act(async () => {
      video?.dispatchEvent(new Event('canplay'));
      await vi.advanceTimersByTimeAsync(MEDIA_LOAD_TIMEOUT_MS + 1_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('keeps waiting on a direct source while bytes keep flowing', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const video = host.querySelector('video');
    await act(async () => { await vi.advanceTimersByTimeAsync(MEDIA_LOAD_TIMEOUT_MS - 5_000); });
    await act(async () => {
      video?.dispatchEvent(new Event('progress'));
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      video?.dispatchEvent(new Event('progress'));
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('gives adaptive streams a longer window before abandoning a hanging source', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer({
      ...DIRECT_STREAM,
      qualities: [
        { label: '720p', approx: false, source: { url: 'https://media.test/hls.m3u8', providerRef: 'test', label: '720p', kind: 'file' as const, exact: true } },
        { label: '480p', approx: false, source: { url: 'https://media.test/480.mp4', providerRef: 'test', label: '480p', kind: 'file' as const, exact: true } }
      ]
    });
    expect(host.querySelector('video')?.getAttribute('src')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(MEDIA_LOAD_TIMEOUT_MS); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(ADAPTIVE_LOAD_TIMEOUT_MS - MEDIA_LOAD_TIMEOUT_MS); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    expect(host.querySelector('video')?.getAttribute('src')).toBe('https://media.test/480.mp4');
    await act(async () => root.unmount());
  });

  it('falls back to the next mirror when playback freezes without new data', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    expect(usePlayer.getState().session?.error).toBe('');
    expect(host.querySelector('video')?.getAttribute('src')).toBe('https://media.test/480p.mp4');
    await act(async () => root.unmount());
  });

  it('does not abandon a paused video', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      video.dispatchEvent(new Event('pause'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS * 2);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('keeps waiting while media data is still arriving', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 2_000);
        video.dispatchEvent(new Event('progress'));
      }
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('restarts the stall window when buffering begins', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 1_000);
      video.dispatchEvent(new Event('waiting'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 1_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    await act(async () => root.unmount());
  });

  it('does not treat seeking or a resumed seek as a stall', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      video.dispatchEvent(new Event('seeking'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS * 2);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => {
      video.currentTime = 90;
      video.dispatchEvent(new Event('seeked'));
      video.dispatchEvent(new Event('progress'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 2_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('does not treat advancing playback as a stall', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(MIRROR_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 2_000);
      video.currentTime = 31;
      video.dispatchEvent(new Event('timeupdate'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS - 2_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('gives adaptive streams a longer playback stall window', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(HLS_STREAM);
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      await vi.advanceTimersByTimeAsync(PLAYBACK_STALL_TIMEOUT_MS);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(ADAPTIVE_STALL_TIMEOUT_MS - PLAYBACK_STALL_TIMEOUT_MS); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    expect(host.querySelector('video')?.getAttribute('src')).toBe('https://media.test/480p.mp4');
    await act(async () => root.unmount());
  });

  it('keeps waiting while HLS is still loading fragments', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(HLS_STREAM);
    await waitForHlsAttach();
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => {
      video.dispatchEvent(new Event('playing'));
      await vi.advanceTimersByTimeAsync(ADAPTIVE_STALL_TIMEOUT_MS - 5_000);
      hlsMock.dataHandler?.('fragLoading', { fatal: false, type: 'fragLoading' });
      await vi.advanceTimersByTimeAsync(ADAPTIVE_STALL_TIMEOUT_MS - 5_000);
    });
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    expect(usePlayer.getState().session?.error).toBe('');
    await act(async () => root.unmount());
  });

  it('recovers a fatal HLS media error once before abandoning the source', async () => {
    const { root } = await renderPlayer(HLS_STREAM);
    await waitForHlsAttach();
    await act(async () => {
      hlsMock.errorHandler?.('error', { fatal: true, type: 'mediaError', details: 'bufferStalledError' });
    });
    expect(hlsMock.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => {
      hlsMock.errorHandler?.('error', { fatal: true, type: 'mediaError', details: 'bufferStalledError' });
    });
    expect(hlsMock.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    await act(async () => root.unmount());
  });

  it('falls back when playback stays stalled after HLS recovery', async () => {
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(HLS_STREAM);
    await waitForHlsAttach();
    const video = host.querySelector('video');
    if (!video) throw new Error('video element missing');
    markPlaying(video, 30);
    await act(async () => { video.dispatchEvent(new Event('playing')); });
    await act(async () => {
      hlsMock.errorHandler?.('error', { fatal: true, type: 'mediaError', details: 'bufferStalledError' });
    });
    expect(hlsMock.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(ADAPTIVE_STALL_TIMEOUT_MS); });
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    await act(async () => root.unmount());
  });

  it('ignores non-fatal HLS errors and falls back on fatal network errors', async () => {
    const { root } = await renderPlayer(HLS_STREAM);
    await waitForHlsAttach();
    await act(async () => {
      hlsMock.errorHandler?.('error', { fatal: false, type: 'networkError', details: 'fragLoadError' });
    });
    expect(hlsMock.recoverMediaError).not.toHaveBeenCalled();
    expect(usePlayer.getState().session?.sourceIndex).toBe(0);
    await act(async () => {
      hlsMock.errorHandler?.('error', { fatal: true, type: 'networkError', details: 'manifestLoadError' });
    });
    expect(hlsMock.recoverMediaError).not.toHaveBeenCalled();
    expect(usePlayer.getState().session?.sourceIndex).toBe(1);
    await act(async () => root.unmount());
  });

  it('captures touch gestures only on direct video, never on provider embeds', async () => {
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    const direct = await renderPlayer(DIRECT_STREAM);
    const directSurface = direct.host.querySelector('.episode-player-video') as HTMLElement;
    await act(async () => {
      directSurface.dispatchEvent(pointerDown('touch'));
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(direct.host.querySelector('.player-controls')).not.toBeNull();
    await act(async () => direct.root.unmount());
    usePlayer.getState().close();

    capture.mockClear();
    const embed = await renderPlayer(EMBED_STREAM);
    const embedSurface = embed.host.querySelector('.episode-player-video') as HTMLElement;
    expect(embed.host.querySelector('iframe')).not.toBeNull();
    expect(embed.host.querySelector('.player-controls')).toBeNull();
    expect(embed.host.querySelector('button[aria-label="Putar video"]')).toBeNull();
    await act(async () => {
      embedSurface.dispatchEvent(pointerDown('touch'));
    });
    expect(capture).not.toHaveBeenCalled();
    await act(async () => embed.root.unmount());
  });
});
