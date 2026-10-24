import { describe, expect, it } from 'vitest';
import { getSearchSourceStatus } from '../src/views/Search';
import type { SourceResult } from '../src/core/types';

const source = (id: string, ok: boolean): SourceResult => ({
  id,
  ok,
  count: 0,
  items: [],
  ...(ok ? {} : { error: 'timeout' })
});

describe('search result state', () => {
  it('does not treat provider failures as a valid empty result', () => {
    expect(getSearchSourceStatus([source('otakudesu', false), source('samehadaku', false)]))
      .toEqual({ partial: false, failed: true });
  });

  it('marks successful empty results mixed with failures as partial', () => {
    expect(getSearchSourceStatus([source('otakudesu', true), source('samehadaku', false)]))
      .toEqual({ partial: true, failed: false });
  });

  it('keeps a valid empty result distinct from provider failure', () => {
    expect(getSearchSourceStatus([source('otakudesu', true)]))
      .toEqual({ partial: false, failed: false });
  });
});
