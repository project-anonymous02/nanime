// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailBundle, StreamBundle } from '../src/core/types';
import { usePlayer } from '../src/state/player';

const api = vi.hoisted(() => ({ stream: vi.fn(), detail: vi.fn() }));
vi.mock('../src/core/services/Catalog', async importOriginal => {
  const original = await importOriginal<typeof import('../src/core/services/Catalog')>();
  return { ...original, Catalog: { ...original.Catalog, stream: api.stream, detail: api.detail } };
});

import { Watch } from '../src/views/Watch';

const bundle = (episode: string): StreamBundle => ({
  id: 'anime-race', title: 'Race Test', poster: '', episode, qualities: [], defaultQuality: '480p',
  servers: [{ ref: 'test', label: 'internal', url: `https://media.test/e${episode}.mp4`, providerRef: 'test' }],
  downloads: [], synopsis: '', sourceCount: 1
});

const detail = {
  id: 'anime-race', title: 'Race Test', alt: '', poster: '', score: '', type: '', status: '', year: '',
  episodes: '3', duration: '', studio: '', genres: [], synopsis: '', sourceCount: 1, recommendations: [],
  episodeList: [1, 2, 3].map(n => ({
    num: String(n), id: `episode-id-${n}`, slug: `episode-${n}`, date: '',
    sources: [{ provider: 'test-provider', id: `episode-id-${n}`, slug: `episode-${n}` }]
  }))
} as unknown as DetailBundle;

let root: Root;
let host: HTMLDivElement;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitUntil(fn: () => void) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    try { fn(); return; } catch { await act(async () => { await sleep(10); }); }
  }
  fn();
}

async function chooseEpisode(n: number) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.wp-epchip')].find(el => el.textContent === String(n));
  if (!button) throw new Error(`Episode ${n} button missing`);
  await act(async () => { button.click(); });
}

beforeEach(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  usePlayer.getState().close();
  api.detail.mockResolvedValue(detail);
  api.stream.mockImplementation((_id: string, episode: string) => Promise.resolve(bundle(episode)));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/watch/anime-race/1'] },
      createElement(Routes, null, createElement(Route, { path: '/watch/:id/:episode', element: createElement(Watch) }))));
  });
  await waitUntil(() => expect(usePlayer.getState().session?.episode).toBe('1'));
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  usePlayer.getState().close();
  vi.clearAllMocks();
});

describe('Watch episode switching', () => {
  it('keeps episode 3 active when episode 2 resolves after it', async () => {
    let resolve2!: (value: StreamBundle) => void;
    let resolve3!: (value: StreamBundle) => void;
    api.stream.mockImplementation((_id: string, episode: string) => {
      if (episode === '1') return Promise.resolve(bundle('1'));
      return new Promise<StreamBundle>(resolve => {
        if (episode === '2') resolve2 = resolve;
        if (episode === '3') resolve3 = resolve;
      });
    });
    await chooseEpisode(2);
    await waitUntil(() => expect(api.stream).toHaveBeenCalledWith('anime-race', '2', expect.objectContaining({ episodeId: 'episode-id-2' })));
    await chooseEpisode(3);
    await waitUntil(() => expect(api.stream).toHaveBeenCalledWith('anime-race', '3', expect.objectContaining({ episodeId: 'episode-id-3' })));
    await act(async () => { resolve3(bundle('3')); });
    await waitUntil(() => expect(usePlayer.getState().session?.stream.servers[0].url).toBe('https://media.test/e3.mp4'));
    await act(async () => { resolve2(bundle('2')); await sleep(20); });
    expect(usePlayer.getState().session?.episode).toBe('3');
    expect(usePlayer.getState().session?.stream.servers[0].url).toBe('https://media.test/e3.mp4');
  });

  it('clears the old session and displays an error when the selected episode fails', async () => {
    api.stream.mockImplementation((_id: string, episode: string) => episode === '1'
      ? Promise.resolve(bundle('1'))
      : Promise.reject(new Error('episode source failed')));
    await chooseEpisode(2);
    await waitUntil(() => expect(host.textContent).toContain('Gagal memuat data'));
    expect(usePlayer.getState().session).toBeNull();
    expect(usePlayer.getState().playUrl).toBe('');
  });
});
