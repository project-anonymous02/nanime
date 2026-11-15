// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { FULLSCREEN_REQUEST_TIMEOUT_MS } from '../src/ui/usePlayerFullscreen';
import { usePlayer } from '../src/state/player';
import { ErrorBoundary } from '../src/shell/ErrorBoundary';
import type { StreamBundle } from '../src/core/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const nativeMock = vi.hoisted(() => ({
  platform: false,
  setActive: vi.fn(async (_options: { active: boolean; landscape?: boolean }) => ({ active: true })),
  listeners: [] as Array<(active: boolean) => void>
}));

vi.mock('../src/lib/nativeFullscreen', () => ({
  isNativeFullscreenPlatform: () => nativeMock.platform,
  setNativeFullscreenActive: nativeMock.setActive,
  setNativeOrientationLock: vi.fn(async () => null),
  listenNativeFullscreen: (listener: (active: boolean) => void) => {
    nativeMock.listeners.push(listener);
    return () => {
      const index = nativeMock.listeners.indexOf(listener);
      if (index >= 0) nativeMock.listeners.splice(index, 1);
    };
  }
}));

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

type RequestMode = 'resolve' | 'reject' | 'hang';

const fullscreenStub = {
  mode: 'resolve' as RequestMode,
  calls: [] as Element[],
  exitCalls: 0,
  element: null as Element | null,
  /** Resolusi request ditunda → fullscreen aktif belakangan (permintaan basi). */
  deferred: false,
  resolveDeferred: null as (() => void) | null
};

function installFullscreenApi(): void {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenStub.element
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  (Element.prototype as unknown as { requestFullscreen: (options?: unknown) => Promise<void> }).requestFullscreen =
    function requestFullscreen(this: Element) {
      fullscreenStub.calls.push(this);
      if (fullscreenStub.mode === 'reject') return Promise.reject(new Error('fullscreen denied'));
      if (fullscreenStub.mode === 'hang') return new Promise<void>(() => undefined);
      if (fullscreenStub.deferred) {
        return new Promise<void>(resolve => {
          fullscreenStub.resolveDeferred = () => {
            fullscreenStub.element = this;
            document.dispatchEvent(new Event('fullscreenchange'));
            resolve();
          };
        });
      }
      fullscreenStub.element = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
  (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = () => {
    fullscreenStub.exitCalls += 1;
    fullscreenStub.element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
}

const orientationMock = { lock: vi.fn(async () => undefined), unlock: vi.fn() };

async function renderPlayer(stream: StreamBundle): Promise<{ host: HTMLDivElement; root: Root }> {
  const request = usePlayer.getState().start({
    animeId: 'test-anime', title: 'Test Anime', poster: '', episode: '1',
    retry: () => undefined, onProgress: () => undefined
  });
  usePlayer.getState().update(request, { loading: false, stream });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ErrorBoundary, null,
      createElement(MemoryRouter, { initialEntries: ['/detail/test-anime'] }, createElement(PlayerOverlay))));
  });
  return { host, root };
}

function fullscreenButton(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('.player-video-top-controls button[aria-label="Layar penuh"], .player-video-top-controls button[aria-label="Keluar layar penuh"]');
  if (!button) throw new Error('tombol fullscreen tidak ditemukan');
  return button;
}

function playerBox(host: HTMLElement): HTMLElement {
  const box = host.querySelector<HTMLElement>('.episode-player');
  if (!box) throw new Error('box player tidak ditemukan');
  return box;
}

/** Ekstrak deklarasi CSS untuk sebuah selector (selector list digabung). */
function cssFor(css: string, selector: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped))) {
    const selectors = match[1].split(',').map(part => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies.join(' ');
}

describe('player fullscreen', () => {
  beforeEach(() => {
    fullscreenStub.mode = 'resolve';
    fullscreenStub.calls = [];
    fullscreenStub.exitCalls = 0;
    fullscreenStub.element = null;
    fullscreenStub.deferred = false;
    fullscreenStub.resolveDeferred = null;
    nativeMock.platform = false;
    nativeMock.setActive.mockClear();
    nativeMock.listeners.length = 0;
    orientationMock.lock.mockClear();
    orientationMock.unlock.mockClear();
    installFullscreenApi();
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock: orientationMock.lock, unlock: orientationMock.unlock }
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    usePlayer.getState().close();
  });

  it('enters and exits fullscreen for a direct video source', async () => {
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const button = fullscreenButton(host);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await act(async () => { button.click(); });
    expect(fullscreenStub.calls).toHaveLength(1);
    // Fullscreen diminta pada box player, bukan pada elemen <video>.
    expect(fullscreenStub.calls[0]).toBe(playerBox(host));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Keluar layar penuh');

    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenStub.exitCalls).toBe(1);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => root.unmount());
  });

  it('enters and exits fullscreen for an embedded provider source', async () => {
    const { host, root } = await renderPlayer(EMBED_STREAM);
    expect(host.querySelector('iframe')).not.toBeNull();
    const button = fullscreenButton(host);
    expect(button).toBeTruthy();

    await act(async () => { button.click(); });
    // Fullscreen dimiliki Nanime: iframe provider tidak pernah diminta fullscreen.
    expect(fullscreenStub.calls).toHaveLength(1);
    expect(fullscreenStub.calls[0]).toBe(playerBox(host));
    expect(fullscreenStub.calls[0]?.tagName).not.toBe('IFRAME');
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('true');

    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenStub.exitCalls).toBe(1);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => root.unmount());
  });

  it('keeps the embed provider free to run its own fullscreen', async () => {
    const { host, root } = await renderPlayer(EMBED_STREAM);
    // Provider boleh memakai fullscreen-nya sendiri (ditangani WebChromeClient
    // Nanime di Android) → izin fullscreen tetap diberikan ke iframe.
    const frame = host.querySelector('iframe');
    expect(frame?.getAttribute('allow')).toContain('fullscreen');
    expect(frame?.hasAttribute('allowfullscreen')).toBe(true);
    await act(async () => root.unmount());
  });

  it('falls back to the visual fullscreen when the browser rejects the request', async () => {
    fullscreenStub.mode = 'reject';
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });

    expect(playerBox(host).classList.contains('player-fs')).toBe(true);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('falls back to the visual fullscreen when the browser request never settles', async () => {
    vi.useFakeTimers();
    fullscreenStub.mode = 'hang';
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    // Promise menggantung (Android WebView membuang permintaan fullscreen) →
    // jalur fallback harus tetap berjalan setelah timeout.
    await act(async () => { await vi.advanceTimersByTimeAsync(FULLSCREEN_REQUEST_TIMEOUT_MS + 10); });

    expect(playerBox(host).classList.contains('player-fs')).toBe(true);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('uses the native immersive path instead of the web API on Android', async () => {
    nativeMock.platform = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });

    expect(fullscreenStub.calls).toHaveLength(0);
    expect(playerBox(host).classList.contains('player-fs')).toBe(true);
    expect(nativeMock.setActive).toHaveBeenCalledWith(true, true);
    expect(orientationMock.lock).toHaveBeenCalledWith('landscape');

    await act(async () => { fullscreenButton(host).click(); });
    expect(nativeMock.setActive).toHaveBeenLastCalledWith(false, true);
    expect(orientationMock.unlock).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('does not call the Android-only native plugin on the web', async () => {
    nativeMock.platform = false;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    expect(nativeMock.setActive).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('ignores repeated fullscreen requests while one is in flight', async () => {
    fullscreenStub.mode = 'hang';
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const button = fullscreenButton(host);
    await act(async () => { button.click(); });
    await act(async () => { button.click(); });
    expect(fullscreenStub.calls).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it('cancels a pending fullscreen request when the button is tapped again', async () => {
    fullscreenStub.mode = 'hang';
    vi.useFakeTimers();
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenButton(host).getAttribute('aria-busy')).toBe('true');
    await act(async () => { fullscreenButton(host).click(); });
    // Request dibatalkan → tombol tidak lagi "busy" dan tidak masuk fullscreen.
    expect(fullscreenButton(host).getAttribute('aria-busy')).toBeNull();
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => { await vi.advanceTimersByTimeAsync(FULLSCREEN_REQUEST_TIMEOUT_MS + 10); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(false);
    await act(async () => root.unmount());
  });

  it('reverts a fullscreen that completes after the user asked to leave', async () => {
    fullscreenStub.deferred = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    // User menekan tombol lagi sebelum browser menyelesaikan permintaan.
    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');

    // Permintaan lama selesai belakangan → harus langsung dibatalkan lagi.
    await act(async () => { fullscreenStub.resolveDeferred?.(); });
    expect(fullscreenStub.exitCalls).toBeGreaterThan(0);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => root.unmount());
  });

  it('keeps the state consistent when exit is requested repeatedly', async () => {
    nativeMock.platform = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    const exit = (window as unknown as { __nanimeExitFullscreen?: () => boolean }).__nanimeExitFullscreen;
    expect(typeof exit).toBe('function');
    await act(async () => { exit?.(); exit?.(); });
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    expect(nativeMock.setActive).toHaveBeenLastCalledWith(false, true);
    await act(async () => root.unmount());
  });

  it('syncs React state with the browser fullscreen element', async () => {
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const box = playerBox(host);
    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('true');

    // Browser keluar dari fullscreen (mis. tombol Esc browser).
    await act(async () => {
      fullscreenStub.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    expect(box.classList.contains('player-fs')).toBe(false);
    await act(async () => root.unmount());
  });

  it('does not resurrect the fullscreen when a late fullscreenerror arrives', async () => {
    fullscreenStub.mode = 'reject';
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(true);

    await act(async () => { fullscreenButton(host).click(); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(false);

    // Error dari request lama yang telat → tidak boleh menghidupkan kembali.
    await act(async () => { document.dispatchEvent(new Event('fullscreenerror')); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(false);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => root.unmount());
  });

  it('keeps the fullscreen state when the browser refuses to leave fullscreen', async () => {
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    // exitFullscreen ditolak browser → DOM masih fullscreen → state harus jujur.
    (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = () => Promise.reject(new Error('nope'));
    await act(async () => { fullscreenButton(host).click(); });
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('true');
    await act(async () => root.unmount());
  });

  it('clears the visual fullscreen when the native immersive mode is switched off', async () => {
    nativeMock.platform = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(true);
    await act(async () => { nativeMock.listeners.forEach(listener => listener(false)); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(false);
    expect(fullscreenButton(host).getAttribute('aria-pressed')).toBe('false');
    await act(async () => root.unmount());
  });

  it('restores orientation and system bars when the player is closed in fullscreen', async () => {
    nativeMock.platform = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    await act(async () => { fullscreenButton(host).click(); });
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Tutup pemutar"]');
    expect(close).toBeTruthy();
    await act(async () => { close?.click(); });
    expect(nativeMock.setActive).toHaveBeenLastCalledWith(false, true);
    expect(orientationMock.unlock).toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('keeps the Android back button able to leave the visual fullscreen', async () => {
    nativeMock.platform = true;
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const exit = (window as unknown as { __nanimeExitFullscreen?: () => boolean }).__nanimeExitFullscreen;
    let handled = false;
    await act(async () => { handled = exit?.() ?? false; });
    expect(handled).toBe(false);
    await act(async () => { fullscreenButton(host).click(); });
    await act(async () => { handled = exit?.() ?? false; });
    expect(handled).toBe(true);
    await act(async () => { await Promise.resolve(); });
    expect(playerBox(host).classList.contains('player-fs')).toBe(false);
    await act(async () => root.unmount());  });

  it('keeps playback gestures and the existing controls working', async () => {
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const playButton = host.querySelector<HTMLButtonElement>('button[aria-label="Putar video"]');
    await act(async () => { playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(play).toHaveBeenCalledTimes(1);

    const surface = host.querySelector<HTMLElement>('.episode-player-video');
    await act(async () => { surface?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(play).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('keeps the fullscreen control reachable by the header overlay', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');
    // Header full player adalah bar penuh lebar: tidak boleh menelan tap.
    expect(cssFor(css, '.episode-player-backdrop:not(.mini) .episode-player-head')).toMatch(/pointer-events:\s*none/);
    expect(cssFor(css, '.episode-player-backdrop:not(.mini) .player-overlay-actions')).toMatch(/pointer-events:\s*auto/);
    // Kontrol video harus berada di atas header (z-index), bukan di bawahnya.
    const headZ = Number(/z-index:\s*(\d+)/.exec(cssFor(css, '.episode-player-backdrop:not(.mini) .episode-player-head'))?.[1]);
    const controlsZ = Number(/z-index:\s*(\d+)/.exec(cssFor(css, '.player-video-top-controls'))?.[1]);
    expect(Number.isFinite(headZ)).toBe(true);
    expect(Number.isFinite(controlsZ)).toBe(true);
    expect(controlsZ).toBeGreaterThan(headZ);
    // Aksi header tidak boleh menumpuk vertikal (grid) — harus tetap satu baris.
    expect(cssFor(css, '.episode-player-head > div:first-child')).toMatch(/display:\s*grid/);
    expect(css).not.toMatch(/\.episode-player-head > div \{[^}]*display: grid/);
  });

  it('keeps the fullscreen control inside the video controls, outside the header', async () => {
    const { host, root } = await renderPlayer(DIRECT_STREAM);
    const button = fullscreenButton(host);
    const controls = host.querySelector('.player-video-top-controls');
    const head = host.querySelector('.episode-player-head');
    expect(controls).toBeTruthy();
    expect(head).toBeTruthy();
    expect(head?.contains(button)).toBe(false);
    expect(controls?.contains(button)).toBe(true);
    await act(async () => root.unmount());
  });

  it('respects safe-area insets and the landscape layout for the video controls', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');
    expect(cssFor(css, '.player-video-top-controls')).toMatch(/top:\s*max\(10px,\s*env\(safe-area-inset-top\)\)/);
    const landscape = /@media \(orientation: landscape\) and \(max-height: 560px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(landscape).toMatch(/\.player-video-top-controls/);
    expect(cssFor(css, '.episode-player-backdrop:not(.mini) .episode-player.player-fs')).toMatch(/position:\s*fixed/);
    expect(cssFor(css, '.episode-player-backdrop:not(.mini) .episode-player:fullscreen')).toMatch(/position:\s*fixed/);
  });
});
