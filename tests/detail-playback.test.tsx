// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailBundle, StreamBundle } from '../src/core/types';

const api = vi.hoisted(() => ({ detail: vi.fn(), stream: vi.fn() }));
vi.mock('../src/core/services/Catalog', async importOriginal => {
  const original = await importOriginal<typeof import('../src/core/services/Catalog')>();
  return { ...original, Catalog: { ...original.Catalog, detail: api.detail, stream: api.stream } };
});
import { Detail } from '../src/views/Detail';
import { PlayerOverlay } from '../src/ui/PlayerOverlay';
import { usePlayer } from '../src/state/player';
import { useWatchParty } from '../src/state/watchParty';

const episode = (num: string) => ({ num, id: `provider-ep-${num}`, slug: `ep-${num}`, date: '', sources: [{ provider: 'provider', id: `provider-ep-${num}`, slug: `ep-${num}` }] });
function bundle(): DetailBundle {
  return { id: 'anime-a', title: 'Anime A', alt: '', poster: 'https://img.test/poster.jpg', score: '', type: 'TV', status: '', year: '', episodes: '2', duration: '', studio: '', genres: [], synopsis: '', sourceCount: 1, episodeList: [episode('1'), episode('2')], recommendations: [] };
}
function stream(num: string): StreamBundle {
  const url = `https://cdn.test/episode-${num}.mp4`;
  return { id: 'anime-a', title: 'Anime A', poster: '', episode: num, qualities: [], defaultQuality: null, servers: [{ ref: 'provider:main', label: `Server ${num}`, url, providerRef: 'provider' }], downloads: [], synopsis: '', sourceCount: 1, availability: 'direct-media', sourceKind: 'direct-media' };
}
let root: Root;
let host: HTMLDivElement;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(assertion: () => void) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { try { assertion(); return; } catch { await act(async () => { await sleep(10); }); } }
  assertion();
}
async function renderDetail(path = '/detail/anime-a') {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement('div', null,
    createElement(Routes, null,
      createElement(Route, { path: '/detail/:id', element: createElement(Detail) }),
      createElement(Route, { path: '/home', element: createElement('div', null, 'Home') })
    ),
    createElement(Link, { to: '/home', 'aria-label': 'Home' }, 'Home'),
    createElement(PlayerOverlay)
  ))));
  await until(() => expect(host.querySelector('.dt-eplist')).not.toBeNull());
}
async function clickEpisode(num: string) {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-label="Putar episode ' + num + '"]'))[0];
  await act(async () => { button.click(); });
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  api.detail.mockResolvedValue(bundle());
});
afterEach(async () => { await act(async () => root.unmount()); usePlayer.getState().close(); useWatchParty.getState().clear(); host.remove(); vi.clearAllMocks(); });

describe('episode playback flow', () => {
  it('episode click immediately opens loading UI, resolves the selected provider episode, and renders a validated media URL', async () => {
    let resolve!: (value: StreamBundle) => void;
    api.stream.mockImplementation(() => new Promise<StreamBundle>(done => { resolve = done; }));
    await renderDetail();
    await clickEpisode('1');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Menyiapkan sumber video');
    expect(api.stream).toHaveBeenCalledWith('anime-a', '1', { title: 'Anime A', episodeProvider: 'provider', episodeId: 'provider-ep-1', episodeSlug: 'ep-1' });
    await act(async () => resolve(stream('1')));
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-1.mp4'));
  });

  it('opens the episode specified by a watch party deep link after the catalog loads', async () => {
    useWatchParty.getState().set({ id: 'party-a', invite_code: 'invite', host_id: 'host-a', anime_id: 'anime-a', title: 'Anime A', poster: null, episode: '2', position_seconds: 0, is_playing: false, updated_at: new Date().toISOString(), created_at: new Date().toISOString() });
    api.stream.mockResolvedValue(stream('2'));
    await renderDetail('/detail/anime-a?title=Anime%20A&episode=1&partyId=party-a');
    await until(() => expect(api.stream).toHaveBeenCalledWith('anime-a', '2', expect.objectContaining({ episodeId: 'provider-ep-2' })));
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-2.mp4'));
  });

  it('shows the provider reason and retry control when the resolver returns no source', async () => {
    api.stream.mockResolvedValue({ ...stream('1'), availability: 'unavailable', servers: [], unavailableReason: 'Tidak ada sumber episode.' });
    await renderDetail(); await clickEpisode('1');
    await until(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('Tidak ada sumber episode'));
    expect(host.querySelector('[role="alert"] button')?.textContent).toBe('Coba lagi');
  });

  it('shows a useful error and retry after a rejected request', async () => {
    api.stream.mockRejectedValue(new Error('Provider menolak episode ini.'));
    await renderDetail(); await clickEpisode('1');
    await until(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('Provider menolak episode ini'));
  });

  it('ignores a late resolution when a newer episode was selected and restores detail after closing', async () => {
    let resolveFirst!: (value: StreamBundle) => void;
    api.stream.mockImplementation((_id: string, num: string) => num === '1'
      ? new Promise<StreamBundle>(done => { resolveFirst = done; })
      : Promise.resolve(stream('2')));
    await renderDetail(); await clickEpisode('1'); await clickEpisode('2');
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-2.mp4'));
    await act(async () => resolveFirst(stream('1')));
    expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-2.mp4');
    await act(async () => (host.querySelector('[aria-label="Tutup pemutar"]') as HTMLButtonElement).click());
    expect(host.querySelector('h1')?.textContent).toBe('Anime A');
    expect(host.querySelector('.dt-eplist')).not.toBeNull();
  });

  it('keeps the same video element alive in mini mode across route changes', async () => {
    api.stream.mockResolvedValue(stream('1'));
    await renderDetail(); await clickEpisode('1');
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-1.mp4'));
    const video = host.querySelector('video');
    await act(async () => (host.querySelector('[aria-label="Home"]') as HTMLAnchorElement).click());
    await until(() => expect(host.querySelector('.episode-player-backdrop')?.classList.contains('mini')).toBe(true));
    expect(host.querySelector('video')).toBe(video);
    await act(async () => (host.querySelector('[aria-label="Buka pemutar"]') as HTMLButtonElement).click());
    expect(host.querySelector('video')).toBe(video);
    expect(host.querySelector('.episode-player-backdrop')?.classList.contains('mini')).toBe(false);
  });

  it('renders direct-media playback controls for seeking, fit, and fullscreen', async () => {
    api.stream.mockResolvedValue(stream('1'));
    await renderDetail(); await clickEpisode('1');
    await until(() => expect(host.querySelector('[aria-label="Posisi video"]')).not.toBeNull());
    expect(host.querySelector('[aria-label="Mundur 10 detik"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Maju 10 detik"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Layar penuh"]')).not.toBeNull();
    await act(async () => (host.querySelector('[aria-label="Penuhi video"]') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Sesuaikan video"]')).not.toBeNull();
  });

  it('player episode controls load the adjacent catalog episode and disable the boundary direction', async () => {
    api.stream.mockImplementation((_id: string, num: string) => Promise.resolve(stream(num)));
    await renderDetail(); await clickEpisode('1');
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-1.mp4'));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Episode sebelumnya"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Episode berikutnya"]')?.disabled).toBe(false);
    await act(async () => (host.querySelector('[aria-label="Episode berikutnya"]') as HTMLButtonElement).click());
    await until(() => expect(host.querySelector<HTMLVideoElement>('video')?.src).toBe('https://cdn.test/episode-2.mp4'));
    expect(api.stream).toHaveBeenLastCalledWith('anime-a', '2', expect.objectContaining({ episodeId: 'provider-ep-2' }));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Episode sebelumnya"]')?.disabled).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Episode berikutnya"]')?.disabled).toBe(true);
  });
});
