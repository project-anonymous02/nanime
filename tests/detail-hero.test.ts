// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailBundle } from '../src/core/types';

const api = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('../src/core/services/Catalog', async importOriginal => {
  const original = await importOriginal<typeof import('../src/core/services/Catalog')>();
  return { ...original, Catalog: { ...original.Catalog, detail: api.detail } };
});

import { Detail } from '../src/views/Detail';

function bundle(id: string, heroImage: string): DetailBundle {
  return {
    id, title: id, alt: '', poster: `https://images.test/${id}-poster.jpg`, heroImage,
    score: '', type: 'TV', status: '', year: '', episodes: '', duration: '', studio: '',
    genres: [], synopsis: '', sourceCount: 1, episodeList: [], recommendations: []
  };
}

let root: Root;
let host: HTMLDivElement;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until(assertion: () => void) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    try { assertion(); return; }
    catch { await act(async () => { await sleep(10); }); }
  }
  assertion();
}

beforeEach(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('detail hero artwork', () => {
  it('renders and loads the selected valid hero URL in the real detail image element', async () => {
    api.detail.mockResolvedValue(bundle('anime-a', 'https://images.test/anime-a-banner.jpg'));
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/detail/anime-a'] },
        createElement(Routes, null, createElement(Route, { path: '/detail/:id', element: createElement(Detail) }))));
    });
    await until(() => expect(host.querySelector<HTMLImageElement>('.hn-hero-fade img')?.src).toBe('https://images.test/anime-a-banner.jpg'));
    const image = host.querySelector<HTMLImageElement>('.hn-hero-fade img');
    expect(image?.alt).toBe('anime-a');
    await act(async () => image?.dispatchEvent(new Event('load')));
    await until(() => expect(host.querySelector<HTMLImageElement>('.hn-hero-fade img')?.style.opacity).toBe('1'));
  });

  it('does not let a late anime A response replace the hero after navigating to anime B', async () => {
    let resolveA!: (value: DetailBundle) => void;
    api.detail.mockImplementation((id: string) => id === 'anime-a'
      ? new Promise<DetailBundle>(resolve => { resolveA = resolve; })
      : Promise.resolve(bundle('anime-b', 'https://images.test/anime-b-banner.jpg')));
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/detail/anime-a'] },
      createElement('div', null,
        createElement(Link, { to: '/detail/anime-b' }, 'Buka B'),
        createElement(Routes, null, createElement(Route, { path: '/detail/:id', element: createElement(Detail) }))
      ))));
    await until(() => expect(api.detail).toHaveBeenCalledWith('anime-a', { title: '' }));
    await act(async () => { (host.querySelector('a') as HTMLAnchorElement).click(); });
    await until(() => expect(host.querySelector<HTMLImageElement>('.hn-hero-fade img')?.src).toBe('https://images.test/anime-b-banner.jpg'));
    await act(async () => { resolveA(bundle('anime-a', 'https://images.test/anime-a-banner.jpg')); await sleep(20); });
    expect(host.querySelector<HTMLImageElement>('.hn-hero-fade img')?.src).toBe('https://images.test/anime-b-banner.jpg');
  });
});
