/**
 * IndexedDB KV — lapisan cache yang bertahan melewati refresh halaman.
 * Aman di lingkungan tanpa IndexedDB (SSR/Node/tes): semua operasi jadi no-op.
 */

const DB_NAME = 'nanime-store';
const STORE = 'kv';
const DB_VERSION = 1;

interface Row<T = unknown> {
  key: string;
  value: T;
  expiresAt: number;
  size: number;
  lastAccess: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    return false;
  }
}

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    if (!idbAvailable()) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 1024;
  }
}

/** Ambil nilai bila belum kedaluwarsa; entri kedaluwarsa dihapus. */
export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise<T | null>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result as Row<T> | undefined;
        if (!row) return resolve(null);
        if (row.expiresAt && row.expiresAt < Date.now()) {
          try {
            store.delete(key);
          } catch {
            /* noop */
          }
          return resolve(null);
        }
        row.lastAccess = Date.now();
        try {
          store.put(row);
        } catch {
          /* noop */
        }
        resolve(row.value);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Ambil nilai walau sudah kedaluwarsa (dipakai mode luring). */
export async function idbGetStale<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise<T | null>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as Row<T> | undefined;
        resolve(row ? row.value : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const db = await open();
  if (!db) return;
  return new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const row: Row = {
        key,
        value,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
        size: estimateSize(value),
        lastAccess: Date.now()
      };
      const req = tx.objectStore(STORE).put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbDel(key: string): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
  } catch {
    /* noop */
  }
}

export async function idbClear(): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch {
    /* noop */
  }
}

export async function idbStats(): Promise<{ entries: number; bytes: number }> {
  const db = await open();
  if (!db) return { entries: 0, bytes: 0 };
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as Row[];
        resolve({ entries: rows.length, bytes: rows.reduce((n, r) => n + (r.size || 0), 0) });
      };
      req.onerror = () => resolve({ entries: 0, bytes: 0 });
    } catch {
      resolve({ entries: 0, bytes: 0 });
    }
  });
}

/** LRU: buang entri paling lama diakses bila total melebihi batas. */
export async function idbPrune(maxBytes: number): Promise<void> {
  const db = await open();
  if (!db) return;
  return new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as Row[];
        let total = rows.reduce((n, r) => n + (r.size || 0), 0);
        if (total <= maxBytes) return resolve();
        rows.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0));
        for (const row of rows) {
          if (total <= maxBytes) break;
          try {
            store.delete(row.key);
          } catch {
            /* noop */
          }
          total -= row.size || 0;
        }
        resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
