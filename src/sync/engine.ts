import type { SupabaseClient } from '@supabase/supabase-js';
import { Store, type StoreCollection } from '../core/store';
import { getClient, isConfigured } from './client';
import { currentAuth, currentUserId, initAuth, onAuthChange } from './auth';
import { Queue } from './queue';
import {
  applyMergeToStore,
  contToProgressRows,
  favsToEntryRows,
  histToHistoryRows,
  listsToRows,
  mergeRemote,
  metaToEntryRows,
  settingsToRows
} from './repository';
import type { SyncStatus, TableName } from './types';

/**
 * SyncEngine — orkestrasi local-first.
 * UI tetap memakai Store secara sinkron; engine mengamati perubahan lewat
 * Store.onChange, menandai tabel kotor, lalu push/pull inkremental ke Supabase.
 * Kegagalan remote tidak pernah menghapus data lokal.
 */

const DEBOUNCE_MS = 1800;
const MAX_BATCH = 400; // batas baris per permintaan upsert (data user kecil)

let started = false;
let unsubStore: (() => void) | null = null;
let unsubAuth: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let statusListeners = new Set<(s: SyncStatus) => void>();
let lastStatus: SyncStatus = defaultStatus();

function defaultStatus(): SyncStatus {
  return {
    configured: isConfigured(),
    signedIn: false,
    state: 'idle',
    lastSyncAt: Queue.get().lastSyncAt,
    lastError: null,
    pending: 0,
    guestPending: false
  };
}

function emitStatus(patch?: Partial<SyncStatus>): void {
  lastStatus = { ...lastStatus, ...patch, configured: isConfigured(), pending: Queue.pendingCount() };
  for (const cb of statusListeners) {
    try {
      cb(lastStatus);
    } catch {
      /* noop */
    }
  }
}

export function syncStatus(): SyncStatus {
  return lastStatus;
}

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  statusListeners.add(cb);
  cb(lastStatus);
  return () => statusListeners.delete(cb);
}

/* ─────────── Pemetaan koleksi Store → tabel ─────────── */

const COLL_TO_TABLE: Record<StoreCollection, TableName | null> = {
  favs: 'entries',
  meta: 'entries',
  hist: 'history',
  cont: 'progress',
  seen: 'settings',
  shist: 'settings',
  cfg: 'settings',
  lists: 'lists',
  clear: null
};

function handleStoreChange(c: StoreCollection): void {
  if (!currentUserId()) return; // tamu: tidak ada tujuan remote
  if (c === 'clear') {
    // Reset lokal = tandai semua tabel kotor + hapus semua baris remote via tombstone
    for (const r of favsToEntryRows()) Queue.addTombstone('entries', r.key);
    for (const r of contToProgressRows()) Queue.addTombstone('progress', r.key);
    for (const r of histToHistoryRows()) Queue.addTombstone('history', r.key);
    for (const r of listsToRows()) Queue.addTombstone('lists', r.id);
    for (const k of ['cfg', 'shist', 'seen']) Queue.addTombstone('settings', k);
    Queue.markAllDirty();
  } else {
    const t = COLL_TO_TABLE[c];
    if (t) Queue.markDirty(t);
  }
  emitStatus({ state: 'idle' });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void flush();
  }, DEBOUNCE_MS);
}

/* ─────────── Push / Pull ─────────── */

function rowsFor(table: TableName): Record<string, unknown>[] {
  switch (table) {
    case 'entries':
      return [...favsToEntryRows(), ...metaToEntryRows()] as unknown as Record<string, unknown>[];
    case 'progress':
      return contToProgressRows() as unknown as Record<string, unknown>[];
    case 'history':
      return histToHistoryRows() as unknown as Record<string, unknown>[];
    case 'lists':
      return listsToRows() as unknown as Record<string, unknown>[];
    case 'settings':
      return settingsToRows() as unknown as Record<string, unknown>[];
    default:
      return [];
  }
}

const PK: Record<TableName, string> = {
  entries: 'key',
  progress: 'key',
  history: 'key',
  lists: 'id',
  settings: 'key'
};

async function upsertRows(sb: SupabaseClient, table: TableName, rows: Record<string, unknown>[], uid: string): Promise<string | null> {
  if (!rows.length) return null;
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH).map(r => ({ ...r, user_id: uid }));
    const { error } = await sb.from(table).upsert(chunk, { onConflict: PK[table] });
    if (error) return error.message;
  }
  return null;
}

async function deleteRows(sb: SupabaseClient, table: TableName, keys: string[], uid: string): Promise<string | null> {
  if (!keys.length) return null;
  for (let i = 0; i < keys.length; i += MAX_BATCH) {
    const chunk = keys.slice(i, i + MAX_BATCH);
    const { error } = await sb.from(table).delete().eq('user_id', uid).in(PK[table], chunk);
    if (error) return error.message;
  }
  return null;
}

async function pullTable(sb: SupabaseClient, table: TableName, uid: string, since: number | null): Promise<Record<string, unknown>[] | string> {
  let q = sb.from(table).select('*').eq('user_id', uid);
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  if (error) return error.message;
  return (data as Record<string, unknown>[]) || [];
}

/** Tarik perubahan remote sejak `since` (ms epoch) lalu merge ke Store. */
async function pullRemote(sb: SupabaseClient, uid: string, since: number | null): Promise<string | null> {
  const tables: TableName[] = ['entries', 'progress', 'history', 'lists', 'settings'];
  const got: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    const res = await pullTable(sb, t, uid, since);
    if (typeof res === 'string') return res;
    got[t] = res;
  }
  const merged = mergeRemote({
    entries: got.entries as never,
    progress: got.progress as never,
    history: got.history as never,
    lists: got.lists as never,
    settings: got.settings as never
  });
  if (merged.changed) applyMergeToStore(merged);
  return null;
}

/* ─────────── Flush ─────────── */

export async function flush(): Promise<boolean> {
  if (flushing) return false;
  const uid = currentUserId();
  if (!uid || !isConfigured()) return false;

  const q = Queue.get();
  if (q.failCount > 0 && q.lastFailAt && Date.now() - q.lastFailAt < Queue.retryDelayMs()) {
    return false; // masih dalam jeda backoff
  }

  flushing = true;
  emitStatus({ state: 'syncing', lastError: null });
  const sb = getClient();
  if (!sb) {
    flushing = false;
    emitStatus({ state: 'error', lastError: 'Client Supabase tidak tersedia.' });
    return false;
  }

  try {
    // 1. Pull inkremental (merge remote → lokal) agar tidak menimpa perubahan lain perangkat
    const since = Queue.get().lastSyncAt;
    const pullErr = await pullRemote(sb, uid, since);
    if (pullErr) {
      Queue.recordFailure();
      emitStatus({ state: 'error', lastError: pullErr });
      return false;
    }

    // 2. Push dirty tables (upsert seluruh baris lokal terkini — idempoten)
    const dirty = Queue.get().dirty;
    for (const table of dirty) {
      const rows = rowsFor(table);
      const err = await upsertRows(sb, table, rows, uid);
      if (err) {
        Queue.recordFailure();
        emitStatus({ state: 'error', lastError: err });
        return false;
      }
    }

    // 3. Terapkan tombstone (delete remote)
    const tombs = Queue.get().tombstones;
    const byTable = new Map<TableName, string[]>();
    for (const t of tombs) {
      const arr = byTable.get(t.table) || [];
      arr.push(t.key);
      byTable.set(t.table, arr);
    }
    for (const [table, keys] of byTable) {
      const err = await deleteRows(sb, table, keys, uid);
      if (err) {
        Queue.recordFailure();
        emitStatus({ state: 'error', lastError: err });
        return false;
      }
    }

    const at = Date.now();
    Queue.markPushed(tombs);
    Queue.markSynced(at);
    emitStatus({ state: 'idle', lastSyncAt: at, lastError: null, signedIn: true });
    return true;
  } catch (e) {
    Queue.recordFailure();
    emitStatus({ state: navigator.onLine === false ? 'offline' : 'error', lastError: (e as Error)?.message || 'Gagal sinkronisasi.' });
    return false;
  } finally {
    flushing = false;
  }
}

/** Paksa sinkronisasi penuh (tarik semua + dorong semua). Dipakai setelah login/migrasi. */
export async function forceSync(): Promise<boolean> {
  if (!currentUserId() || !isConfigured()) return false;
  Queue.markAllDirty();
  const sb = getClient();
  if (!sb) return false;
  emitStatus({ state: 'syncing', lastError: null });
  const uid = currentUserId()!;
  const pullErr = await pullRemote(sb, uid, null);
  if (pullErr) {
    Queue.recordFailure();
    emitStatus({ state: 'error', lastError: pullErr });
    return false;
  }
  return flush();
}

/* ─────────── Lifecycle ─────────── */

export function startSync(): void {
  if (started) return;
  started = true;
  void initAuth().then(() => {
    emitStatus({ signedIn: currentAuth().signedIn });
    if (currentUserId()) scheduleFlush();
  });
  unsubStore = Store.onChange(handleStoreChange);
  unsubAuth = onAuthChange(s => {
    emitStatus({ signedIn: s.signedIn });
    if (s.signedIn) scheduleFlush();
  });
  window.addEventListener('online', () => {
    if (currentUserId()) scheduleFlush();
  });
}

export function stopSync(): void {
  unsubStore?.();
  unsubAuth?.();
  unsubStore = null;
  unsubAuth = null;
  started = false;
  if (debounceTimer) clearTimeout(debounceTimer);
}

/** Tandai seluruh koleksi kotor + jadwalkan flush (dipakai setelah migrasi tamu→akun). */
export function markAllAndFlush(): void {
  Queue.markAllDirty();
  scheduleFlush();
}
