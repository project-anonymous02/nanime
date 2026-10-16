import { LS } from '../core/store';
import type { TableName } from './types';

/**
 * Antrean perubahan offline yang bertahan di localStorage.
 * - Setiap perubahan koleksi dimasukkan sebagai "dirty" (penanda tabel).
 * - Deletion dicatat sebagai tombstone agar bisa diterapkan ke remote.
 * - Antrean dipulihkan setelah aplikasi dibuka ulang.
 */

export interface Tombstone {
  table: TableName;
  key: string;
  at: number;
}

export interface QueueState {
  /** Tabel yang punya perubahan lokal menunggu push. */
  dirty: TableName[];
  /** Key yang dihapus lokal, menunggu delete remote. */
  tombstones: Tombstone[];
  lastSyncAt: number | null;
  /** Percobaan push gagal terakhir (untuk backoff). */
  failCount: number;
  lastFailAt: number | null;
}

const QKEY = 'syncq';

const EMPTY: QueueState = { dirty: [], tombstones: [], lastSyncAt: null, failCount: 0, lastFailAt: null };

function load(): QueueState {
  const raw = LS.get<Partial<QueueState>>(QKEY, {});
  return {
    dirty: Array.isArray(raw.dirty) ? (raw.dirty as TableName[]) : [],
    tombstones: Array.isArray(raw.tombstones) ? (raw.tombstones as Tombstone[]) : [],
    lastSyncAt: typeof raw.lastSyncAt === 'number' ? raw.lastSyncAt : null,
    failCount: typeof raw.failCount === 'number' ? raw.failCount : 0,
    lastFailAt: typeof raw.lastFailAt === 'number' ? raw.lastFailAt : null
  };
}

function save(s: QueueState): void {
  LS.set(QKEY, s);
}

export const Queue = {
  get(): QueueState {
    return load();
  },

  markDirty(table: TableName): void {
    const s = load();
    if (!s.dirty.includes(table)) {
      s.dirty.push(table);
      save(s);
    }
  },

  markAllDirty(): void {
    const s = load();
    const all: TableName[] = ['entries', 'progress', 'history', 'lists', 'settings'];
    for (const t of all) if (!s.dirty.includes(t)) s.dirty.push(t);
    save(s);
  },

  addTombstone(table: TableName, key: string): void {
    const s = load();
    // hindari tombstone ganda untuk key yang sama
    s.tombstones = s.tombstones.filter(t => !(t.table === table && t.key === key));
    s.tombstones.push({ table, key, at: Date.now() });
    if (!s.dirty.includes(table)) s.dirty.push(table);
    save(s);
  },

  clearTombstone(table: TableName, key: string): void {
    const s = load();
    s.tombstones = s.tombstones.filter(t => !(t.table === table && t.key === key));
    save(s);
  },

  /** Tandai push sukses: kosongkan dirty & tombstone yang sudah diterapkan. */
  markPushed(appliedTombstones: Tombstone[]): void {
    const s = load();
    s.dirty = [];
    for (const ap of appliedTombstones) {
      s.tombstones = s.tombstones.filter(t => !(t.table === ap.table && t.key === ap.key && t.at === ap.at));
    }
    s.failCount = 0;
    s.lastFailAt = null;
    save(s);
  },

  markSynced(at: number): void {
    const s = load();
    s.lastSyncAt = at;
    s.failCount = 0;
    s.lastFailAt = null;
    save(s);
  },

  recordFailure(): void {
    const s = load();
    s.failCount = (s.failCount || 0) + 1;
    s.lastFailAt = Date.now();
    save(s);
  },

  /** Backoff eksponensial dgn batas; kembalikan jeda ms sebelum percobaan berikut. */
  retryDelayMs(): number {
    const s = load();
    const n = Math.max(0, s.failCount);
    return Math.min(60000, 2000 * Math.pow(2, n));
  },

  pendingCount(): number {
    const s = load();
    return s.dirty.length + s.tombstones.length;
  },

  reset(): void {
    LS.del(QKEY);
  }
};
