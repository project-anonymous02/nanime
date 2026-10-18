// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailBundle, StreamBundle } from '../src/core/types';

const api = vi.hoisted(() => ({ detail: vi.fn(), stream: vi.fn() }));
vi.mock('../src/core/services/Catalog', async importOriginal => {
  const original = await importOriginal<typeof import('../src/core/services/Catalog')>();
  return { ...original, Catalog: { ...original.Catalog, detail: api.detail, stream: api.stream } };
});
import { Detail } from '../src/views/Detail';

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
async function renderDetail() {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/detail/anime-a'] }, createElement(Routes, null, createElement(Route, { path: '/detail/:id', element: createElement(Detail) })))));
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
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });

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
});
