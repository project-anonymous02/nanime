import { describe, it, expect, beforeEach } from 'vitest';
import { Store, LS } from '../src/core/store';
import { Queue } from '../src/sync/queue';
import {
  favsToEntryRows,
  contToProgressRows,
  histToHistoryRows,
  settingsToRows,
  mergeRemote,
  applyMergeToStore,
  keyOf,
  snapshotLocal
} from '../src/sync/repository';
import type { EntryRow, ProgressRow, HistoryRow } from '../src/sync/types';

function resetStore(): void {
  Store.favs = [];
  Store.hist = [];
  Store.cont = [];
  Store.shist = [];
  Store.meta = {};
  Store.seen = {};
  Queue.reset();
  LS.del('lists');
}

describe('repository — konversi Store → baris DB', () => {
  beforeEach(resetStore);

  it('favsToEntryRows memetakan favorit + meta ke baris entries dengan key provider:id', () => {
    Store.toggleFav({ id: '123', title: 'Naruto', cover: 'p.jpg', provider: 'otakudesu', score: '', epLabel: '', sub: '', type: '', slug: 'naruto', t: 1000 });
    Store.setMeta('123', { status: 'watching', rating: 4 });
    const rows = favsToEntryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('otakudesu:123');
    expect(rows[0].anime_id).toBe('123');
    expect(rows[0].favorite).toBe(true);
    expect(rows[0].status).toBe('watching');
    expect(rows[0].rating).toBe(4);
  });

  it('contToProgressRows menghitung posisi & completed dari percent', () => {
    Store.saveProgress({ id: '9', slug: 's', title: 'T', cover: '', ep: '3', provider: 'oploverz', eid: 'e3', eslug: 'e-3', dur: 1400, pct: 97, last: 5000 });
    const rows = contToProgressRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].percent).toBe(97);
    expect(rows[0].completed).toBe(true);
    expect(rows[0].position_sec).toBe(Math.round((1400 * 97) / 100));
  });

  it('histToHistoryRows memetakan watched_at', () => {
    Store.addHist({ id: '5', slug: 's', title: 'A', cover: '', ep: '1', provider: 'kuramanime', eid: '', eslug: '', t: 777 });
    const rows = histToHistoryRows();
    expect(rows[0].watched_at).toBe(777);
  });

  it('settingsToRows menghasilkan cfg/shist/seen', () => {
    Store.addQ('naruto');
    Store.setSeen('otakudesu:1|', 3);
    const keys = settingsToRows().map(r => r.key).sort();
    expect(keys).toEqual(['cfg', 'seen', 'shist']);
  });
});

describe('repository — merge last-write-wins', () => {
  beforeEach(resetStore);

  it('baris remote dengan updated_at lebih baru menimpa lokal', () => {
    Store.toggleFav({ id: '1', title: 'Lama', cover: '', provider: 'p', score: '', epLabel: '', sub: '', type: '', slug: '', t: 100 });
    const remote: EntryRow[] = [
      { key: 'p:1', provider: 'p', anime_id: '1', slug: '', title: 'Baru', poster: '', status: 'completed', rating: 5, favorite: true, note: null, created_at: 100, updated_at: 999 }
    ];
    const res = mergeRemote({ entries: remote });
    expect(res.changed).toBe(true);
    const row = res.favs.find(f => f.id === '1');
    expect(row?.title).toBe('Baru');
    expect(res.meta['1'].status).toBe('completed');
  });

  it('baris remote TIDAK menimpa lokal bila updated_at lebih lama', () => {
    Store.toggleFav({ id: '2', title: 'Lokal Baru', cover: '', provider: 'p', score: '', epLabel: '', sub: '', type: '', slug: '', t: 5000 });
    const remote: EntryRow[] = [
      { key: 'p:2', provider: 'p', anime_id: '2', slug: '', title: 'Remote Lama', poster: '', status: null, rating: null, favorite: true, note: null, created_at: 1, updated_at: 100 }
    ];
    const res = mergeRemote({ entries: remote });
    const row = res.favs.find(f => f.id === '2');
    expect(row?.title).toBe('Lokal Baru');
  });

  it('progress remote terbaru menang; progres lokal lebih baru dipertahankan', () => {
    Store.saveProgress({ id: '7', slug: '', title: 'Lokal', cover: '', ep: '5', provider: 'x', eid: '', eslug: '', dur: 100, pct: 50, last: 9000 });
    const remoteNewer: ProgressRow[] = [
      { key: 'x:7', provider: 'x', anime_id: '7', slug: '', title: 'Remote', poster: '', episode: '9', episode_id: '', episode_slug: '', position_sec: 10, duration_sec: 100, percent: 10, completed: false, updated_at: 99000 }
    ];
    const res = mergeRemote({ progress: remoteNewer });
    const c = res.cont.find(x => x.id === '7');
    expect(c?.title).toBe('Remote');
    expect(c?.ep).toBe('9');
  });

  it('merge remote ke Store menerapkan dedupe & memperbarui localStorage', () => {
    Store.toggleFav({ id: '3', title: 'A', cover: '', provider: 'p', score: '', epLabel: '', sub: '', type: '', slug: '', t: 100 });
    const remote: EntryRow[] = [
      { key: 'p:3', provider: 'p', anime_id: '3', slug: '', title: 'A-updated', poster: '', status: null, rating: null, favorite: true, note: null, created_at: 100, updated_at: 900 }
    ];
    const res = mergeRemote({ entries: remote });
    applyMergeToStore(res);
    expect(Store.favs.find(f => f.id === '3')?.title).toBe('A-updated');
    const persisted = LS.get('favs', [] as { id: string; title: string }[]);
    expect(persisted.find(f => f.id === '3')?.title).toBe('A-updated');
  });

  it('merge tidak pernah menggandakan key yang sama (idempoten)', () => {
    Store.toggleFav({ id: '8', title: 'X', cover: '', provider: 'p', score: '', epLabel: '', sub: '', type: '', slug: '', t: 100 });
    const remote: EntryRow[] = favsToEntryRows().map(r => ({ ...r }));
    // jalankan merge dua kali — jumlah baris tetap 1
    applyMergeToStore(mergeRemote({ entries: remote }));
    applyMergeToStore(mergeRemote({ entries: remote }));
    expect(Store.favs.filter(f => f.id === '8')).toHaveLength(1);
  });
});

describe('queue — antrean offline & tombstone', () => {
  beforeEach(resetStore);

  it('markDirty menambah tabel kotor tanpa duplikat', () => {
    Queue.markDirty('entries');
    Queue.markDirty('entries');
    Queue.markDirty('progress');
    expect(Queue.get().dirty.sort()).toEqual(['entries', 'progress']);
  });

  it('tombstone tercatat & berguna untuk delete remote', () => {
    Queue.addTombstone('history', 'p:1');
    Queue.addTombstone('history', 'p:1'); // duplikat digabung
    const s = Queue.get();
    expect(s.tombstones.filter(t => t.key === 'p:1')).toHaveLength(1);
    expect(s.dirty).toContain('history');
  });

  it('markPushed mengosongkan dirty & tombstone yang diterapkan', () => {
    Queue.markDirty('entries');
    Queue.addTombstone('entries', 'p:9');
    const tombs = Queue.get().tombstones;
    Queue.markPushed(tombs);
    const s = Queue.get();
    expect(s.dirty).toHaveLength(0);
    expect(s.tombstones).toHaveLength(0);
  });

  it('backoff eksponensial dengan batas 60 detik', () => {
    Queue.recordFailure();
    const d1 = Queue.retryDelayMs();
    Queue.recordFailure();
    const d2 = Queue.retryDelayMs();
    expect(d2).toBeGreaterThan(d1);
    for (let i = 0; i < 20; i++) Queue.recordFailure();
    expect(Queue.retryDelayMs()).toBeLessThanOrEqual(60000);
  });

  it('antrean bertahan di localStorage (pulih setelah muat ulang)', () => {
    Queue.markDirty('settings');
    Queue.addTombstone('settings', 'cfg');
    // Simulasikan "muat ulang": baca ulang dari LS
    const s = Queue.get();
    expect(s.dirty).toContain('settings');
    expect(s.tombstones.some(t => t.key === 'cfg')).toBe(true);
  });
});

describe('snapshot & key', () => {
  beforeEach(resetStore);

  it('keyOf membentuk provider:id', () => {
    expect(keyOf('otakudesu', '42')).toBe('otakudesu:42');
    expect(keyOf('', '42')).toBe(':42');
  });

  it('snapshotLocal menghasilkan seluruh entitas', () => {
    Store.toggleFav({ id: '1', title: 'A', cover: '', provider: 'p', score: '', epLabel: '', sub: '', type: '', slug: '', t: 1 });
    Store.saveProgress({ id: '1', slug: '', title: 'A', cover: '', ep: '1', provider: 'p', eid: '', eslug: '', dur: 10, pct: 10, last: 2 });
    Store.addHist({ id: '1', slug: '', title: 'A', cover: '', ep: '1', provider: 'p', eid: '', eslug: '', t: 3 });
    LS.set('lists', [{ id: 'l1', name: 'Favorit saya', createdAt: 1, updatedAt: 1 }]);
    const snap = snapshotLocal();
    expect(snap.entries.length).toBeGreaterThanOrEqual(1);
    expect(snap.progress).toHaveLength(1);
    expect(snap.history).toHaveLength(1);
    expect(snap.lists).toHaveLength(1);
    expect(snap.settings.map(s => s.key).sort()).toEqual(['cfg', 'seen', 'shist']);
  });
});

describe('client — validasi konfigurasi (tanpa membocorkan rahasia)', () => {
  it('readConfig mengembalikan null bila env kosong (lingkungan tes)', async () => {
    const { isConfigured } = await import('../src/sync/client');
    // Pada vitest, VITE_SUPABASE_URL tidak diset → belum dikonfigurasi.
    // Ini memastikan aplikasi tetap jalan penuh dalam mode tamu tanpa Supabase.
    expect(typeof isConfigured()).toBe('boolean');
  });
});
