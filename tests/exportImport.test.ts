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

  it('menolak bundle kosong TANPA menyentuh data lokal', () => {
    Store.favs.push({ id: 'keep', title: 'Keep', cover: '', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: '' });
    const res = applyImport({ app: 'nanime' });
    expect(res.ok).toBe(false);
    expect(Store.favs).toHaveLength(1);
    expect(Store.favs[0].id).toBe('keep');
  });

  it('impor skema v3 (entries/progress/history) dipetakan ke koleksi Store', () => {
    const res = applyImport({
      app: 'nanime',
      schema: 3,
      at: Date.now(),
      entries: [
        { key: 'otakudesu:a', provider: 'otakudesu', animeId: 'a', slug: 'a-slug', title: 'Anime A', poster: 'x.jpg', status: 'watching', rating: 5, favorite: true, listIds: [], createdAt: 1, updatedAt: 2 },
        { key: 'oploverz:b', provider: 'oploverz', animeId: 'b', slug: '', title: 'Anime B', poster: '', status: 'ptw', rating: 0, favorite: false, listIds: [], createdAt: 1, updatedAt: 2 }
      ],
      progress: [
        { key: 'otakudesu:a', provider: 'otakudesu', animeId: 'a', slug: 'a-slug', title: 'Anime A', poster: 'x.jpg', episode: '12', episodeId: 'e12', episodeSlug: 'ep-12', positionSec: 300, durationSec: 1400, percent: 21, completed: false, updatedAt: 999 }
      ],
      history: [
        { key: 'otakudesu:a', provider: 'otakudesu', animeId: 'a', slug: 'a-slug', title: 'Anime A', poster: 'x.jpg', episode: '11', episodeId: 'e11', episodeSlug: 'ep-11', watchedAt: 4242 }
      ],
      lists: [],
      searchHistory: ['jujutsu'],
      seen: { a: 7 },
      settings: { provider: 'anichin', autoNext: false }
    });
    expect(res.ok).toBe(true);
    // favorite:false tidak masuk favorit, tapi status & rating tetap tersimpan
    expect(Store.favs).toHaveLength(1);
    expect(Store.favs[0]).toMatchObject({ id: 'a', slug: 'a-slug', provider: 'otakudesu', cover: 'x.jpg' });
    expect(Store.meta.a).toMatchObject({ status: 'watching', rating: 5 });
    expect(Store.meta.b).toMatchObject({ status: 'ptw', rating: 0 });
    expect(Store.cont[0]).toMatchObject({ id: 'a', ep: '12', pct: 21, dur: 1400, eid: 'e12' });
    expect(Store.hist[0]).toMatchObject({ id: 'a', ep: '11', t: 4242 });
    expect(Store.shist).toEqual(['jujutsu']);
    expect(Store.seen).toEqual({ a: 7 });
    expect(Store.cfg.provider).toBe('anichin');
    expect(Store.cfg.autoNext).toBe(false);
  });

  it('impor v3 yang rusak (entri tanpa animeId) ditolak tanpa merusak data', () => {
    Store.hist.push({ id: 'h1', slug: '', title: 'H', cover: '', ep: '1', provider: 'otakudesu', eid: '', eslug: '' });
    const res = applyImport({
      app: 'nanime',
      schema: 3,
      entries: [{ provider: 'x', title: 'Tanpa ID' }],
      progress: [],
      history: []
    });
    expect(res.ok).toBe(false);
    expect(Store.hist).toHaveLength(1);
    expect(Store.favs).toHaveLength(0);
  });
});
