import { describe, it, expect, beforeEach } from 'vitest';
import { applyImport } from '../src/features/exportImport';
import { Store } from '../src/core/store';

describe('ekspor/impor data', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    Store.favs = [];
    Store.hist = [];
    Store.cont = [];
    Store.meta = {};
    Store.shist = [];
  });

  it('menerima bundle Nanime dan mengisi Store', () => {
    const res = applyImport({
      app: 'nanime',
      v: 2,
      at: Date.now(),
      favs: [{ id: 'a', title: 'A', cover: '', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: '' }],
      hist: [{ id: 'a', slug: '', title: 'A', cover: '', ep: '1', provider: 'otakudesu', eid: '', eslug: '' }],
      cont: [],
      shist: ['naruto'],
      meta: { a: { status: 'watching', rating: 4, t: Date.now() } },
      cfg: { provider: 'oploverz' }
    });
    expect(res.ok).toBe(true);
    expect(Store.favs).toHaveLength(1);
    expect(Store.hist).toHaveLength(1);
    expect(Store.shist).toEqual(['naruto']);
    expect(Store.cfg.provider).toBe('oploverz');
  });

  it('menolak file bukan Nanime', () => {
    expect(applyImport({ app: 'lain', favs: [] }).ok).toBe(false);
    expect(applyImport(null).ok).toBe(false);
    expect(applyImport({ favs: 'bukan-array' }).ok).toBe(false);
  });

  it('menerima bundle tanpa field opsional', () => {
    const res = applyImport({ app: 'nanime' });
    expect(res.ok).toBe(true);
    expect(Store.favs).toHaveLength(0);
  });
});
