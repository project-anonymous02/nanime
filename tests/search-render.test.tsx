// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AggregatedCard, AggregatedSearchResult } from '../src/core/types';
import { Search } from '../src/views/Search';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogMock = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../src/core/services/Catalog', () => ({ Catalog: { search: catalogMock.search } }));
vi.mock('../src/core/services/Telemetry', () => ({ recordClientMetric: vi.fn() }));

const card: AggregatedCard = {
  id: 'naruto', canonicalId: 'naruto', provider: 'otakudesu', title: 'Naruto', poster: '', score: '',
  type: 'TV', status: 'Selesai', epLabel: '220 eps', sub: '', sourceUrl: 'https://catalog.test/naruto',
  sources: [{ provider: 'otakudesu', id: 'naruto', slug: 'naruto' }], providerCount: 1, score1000: 1000
};
const result: AggregatedSearchResult = {
  items: [card], sources: [{ id: 'otakudesu', ok: true, count: 1, items: [card] }]
};

describe('search results rendering', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.clearAllMocks();
  });

  it('replaces progressive results with final results without rendering duplicates', async () => {
    catalogMock.search.mockImplementation((_query: string, options: { onUpdate?: (value: AggregatedSearchResult) => void }) => {
      options.onUpdate?.(result);
      return Promise.resolve(result);
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(MemoryRouter, { initialEntries: ['/search?q=Naruto'] },
        createElement(Routes, null, createElement(Route, { path: '/search', element: createElement(Search) }))));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(catalogMock.search).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.hn-card')).toHaveLength(1);
    expect(host.textContent).toContain('Naruto');
  });
});
