import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/core/store';

describe('Store', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    Store.favs = [];
    Store.hist = [];
    Store.cont = [];
    Store.meta = {};
    Store.shist = [];
    Store.seen = {};
    Store.cfg.provider = 'otakudesu';
  });

  it('toggleFav menambah lalu menghapus', () => {
    const added = Store.toggleFav({ id: 'a', title: 'A', cover: '', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: '' });
    expect(added).toBe(true);
    expect(Store.favs).toHaveLength(1);
    expect(Store.isFav('a', 'otakudesu')).toBe(true);
    const removed = Store.toggleFav({ id: 'a', title: 'A', cover: '', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: '' });
    expect(removed).toBe(false);
    expect(Store.favs).toHaveLength(0);
  });

  it('riwayat dibatasi dan diganti per judul', () => {
    for (let i = 0; i < 70; i++) {
      Store.addHist({ id: 'x' + i, slug: '', title: 'T' + i, cover: '', ep: '1', provider: 'otakudesu', eid: '', eslug: '' });
    }
    expect(Store.hist).toHaveLength(60);

    Store.addHist({ id: 'x0', slug: '', title: 'T0', cover: '', ep: '2', provider: 'otakudesu', eid: '', eslug: '' });
    expect(Store.hist).toHaveLength(60);
    expect(Store.hist[0].ep).toBe('2');
    expect(Store.hist.filter(h => h.id === 'x0')).toHaveLength(1);
  });

  it('progres lanjut nonton disimpan & dihapus', () => {
    Store.saveProgress({ id: 'a', slug: '', title: 'A', cover: '', ep: '3', provider: 'otakudesu', eid: '', eslug: '', pct: 40, dur: 1400 });
    expect(Store.cont).toHaveLength(1);
    Store.removeProgress('a', 'otakudesu');
    expect(Store.cont).toHaveLength(0);
  });

  it('meta status & rating tersimpan', () => {
    Store.setMeta('a', { status: 'completed', rating: 5 });
    expect(Store.meta.a.status).toBe('completed');
    expect(Store.meta.a.rating).toBe(5);
    Store.setMeta('a', { rating: 3 });
    expect(Store.meta.a.status).toBe('completed');
    expect(Store.meta.a.rating).toBe(3);
  });

  it('provider kusonime tidak dipakai sebagai provider utama', () => {
    Store.cfg.provider = 'kusonime';
    expect(Store.getProvider()).toBe('otakudesu');
    Store.cfg.provider = 'oploverz';
    expect(Store.getProvider()).toBe('oploverz');
  });

  it('clearAll mengosongkan semuanya', () => {
    Store.toggleFav({ id: 'a', title: 'A', cover: '', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: '' });
    Store.addQ('naruto');
    Store.clearAll();
    expect(Store.favs).toHaveLength(0);
    expect(Store.shist).toHaveLength(0);
  });
});
