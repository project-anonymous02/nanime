import type {
  Config,
  ContinueItem,
  CustomList,
  FavItem,
  HistItem,
  UserEntry,
  ProgressEntry,
  HistoryEntry,
  WatchStatus
} from '../core/types';
import { Store, LS, type UserStatusMap } from '../core/store';
import type { EntryRow, HistoryRow, ListRow, ProgressRow, SettingRow, TableName } from './types';

/**
 * Lapisan konversi & merge data.
 * - Lokal (Store/localStorage) = sumber utama untuk UI & offline.
 * - Remote (Supabase) = mirror per akun; digabung dengan last-write-wins per baris.
 * Semua merge bersifat deterministik & idempoten (aman dijalankan ulang).
 */

export const keyOf = (provider: string, id: string): string => (provider || '') + ':' + (id || '');

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const clampPct = (v: unknown): number => Math.max(0, Math.min(100, num(v)));

/* ─────────── Store → baris DB ─────────── */

export function favsToEntryRows(): EntryRow[] {
  return Store.favs.map(f => {
    const m = Store.meta[f.id];
    const t = num(f.t) || Date.now();
    return {
      key: keyOf(f.provider, f.id),
      provider: f.provider || '',
      anime_id: f.id,
      slug: f.slug || '',
      title: f.title || '',
      poster: f.cover || '',
      status: (m?.status as WatchStatus) || null,
      rating: m ? num(m.rating) : null,
      favorite: true,
      note: null,
      created_at: t,
      updated_at: num(m?.t) || t
    };
  });
}

/** Baris entries untuk anime yang punya meta tapi belum favorit (status/rating tetap tersinkron). */
export function metaToEntryRows(): EntryRow[] {
  const favKeys = new Set(favsToEntryRows().map(r => r.key));
  const rows: EntryRow[] = [];
  for (const id of Object.keys(Store.meta)) {
    const k = keyOf('', id);
    if (favKeys.has(k)) continue; // sudah dicakup baris favorit
    const m = Store.meta[id];
    rows.push({
      key: k,
      provider: '',
      anime_id: id,
      slug: '',
      title: '',
      poster: '',
      status: (m.status as WatchStatus) || null,
      rating: num(m.rating) || null,
      favorite: false,
      note: null,
      created_at: num(m.t) || Date.now(),
      updated_at: num(m.t) || Date.now()
    });
  }
  return rows;
}

export function contToProgressRows(): ProgressRow[] {
  return Store.cont.map(c => {
    const dur = num(c.dur);
    const pct = clampPct(c.pct);
    return {
      key: keyOf(c.provider, c.id),
      provider: c.provider || '',
      anime_id: c.id,
      slug: c.slug || '',
      title: c.title || '',
      poster: c.cover || '',
      episode: str(c.ep || '1'),
      episode_id: c.eid || '',
      episode_slug: c.eslug || '',
      position_sec: Math.round((dur * pct) / 100),
      duration_sec: dur,
      percent: pct,
      completed: pct >= 95,
      updated_at: num(c.last) || num(c.t) || Date.now()
    };
  });
}

export function histToHistoryRows(): HistoryRow[] {
  return Store.hist.map(h => {
    const t = num(h.t) || Date.now();
    return {
      key: keyOf(h.provider, h.id),
      provider: h.provider || '',
      anime_id: h.id,
      slug: h.slug || '',
      title: h.title || '',
      poster: h.cover || '',
      episode: str(h.ep || '1'),
      episode_id: h.eid || '',
      episode_slug: h.eslug || '',
      watched_at: t,
      updated_at: t
    };
  });
}

export function listsToRows(): ListRow[] {
  return (LS.get<CustomList[]>('lists', []) || []).map(l => ({
    id: l.id,
    name: l.name || '',
    created_at: num(l.createdAt) || Date.now(),
    updated_at: num(l.updatedAt) || num(l.createdAt) || Date.now()
  }));
}

/** Baris settings: cfg, shist, seen — masing-masing satu baris key-value. */
export function settingsToRows(): SettingRow[] {
  const t = Date.now();
  return [
    { key: 'cfg', value: Store.cfg, updated_at: t },
    { key: 'shist', value: Store.shist, updated_at: t },
    { key: 'seen', value: Store.seen, updated_at: t }
  ];
}

/* ─────────── Baris DB → Store ─────────── */

function rowToEntry(e: EntryRow): { fav: FavItem | null; meta?: { id: string; status: WatchStatus; rating: number; t: number } } {
  const t = num(e.updated_at) || num(e.created_at) || Date.now();
  const fav: FavItem | null = e.favorite
    ? {
        id: e.anime_id,
        title: e.title || '',
        cover: e.poster || '',
        provider: e.provider || '',
        score: '',
        epLabel: '',
        sub: '',
        type: '',
        slug: e.slug || '',
        t: num(e.created_at) || t
      }
    : null;
  const hasMeta = e.status != null || (e.rating != null && e.rating > 0);
  const meta = hasMeta
    ? {
        id: e.anime_id,
        status: (e.status as WatchStatus) || 'ptw',
        rating: Math.max(0, Math.min(5, num(e.rating))),
        t
      }
    : undefined;
  return { fav, meta };
}

function rowToCont(p: ProgressRow): ContinueItem {
  return {
    id: p.anime_id,
    slug: p.slug || p.anime_id,
    title: p.title || '',
    cover: p.poster || '',
    ep: str(p.episode || '1'),
    provider: p.provider || '',
    eid: p.episode_id || '',
    eslug: p.episode_slug || '',
    t: num(p.updated_at) || Date.now(),
    dur: num(p.duration_sec),
    pct: clampPct(p.percent),
    last: num(p.updated_at) || Date.now()
  };
}

function rowToHist(h: HistoryRow): HistItem {
  return {
    id: h.anime_id,
    slug: h.slug || h.anime_id,
    title: h.title || '',
    cover: h.poster || '',
    ep: str(h.episode || '1'),
    provider: h.provider || '',
    eid: h.episode_id || '',
    eslug: h.episode_slug || '',
    t: num(h.watched_at) || 0
  };
}

/* ─────────── Merge LWW ─────────── */

/**
 * Gabung baris remote ke koleksi lokal dengan aturan last-write-wins per baris.
 * Mengembalikan struktur siap-timpa Store + daftar key yang berubah.
 */
export interface MergeResult {
  favs: FavItem[];
  cont: ContinueItem[];
  hist: HistItem[];
  meta: UserStatusMap;
  shist: string[];
  seen: Record<string, number>;
  cfg: Partial<Config>;
  lists: CustomList[];
  changed: boolean;
}

export function mergeRemote(
  remote: { entries?: EntryRow[]; progress?: ProgressRow[]; history?: HistoryRow[]; lists?: ListRow[]; settings?: SettingRow[] }
): MergeResult {
  const changed = { v: false };

  /* entries: union by key, LWW pada updated_at; favorit & meta digabung */
  const entryMap = new Map<string, EntryRow>();
  const localEntries = new Map<string, EntryRow>();
  for (const r of favsToEntryRows()) localEntries.set(r.key, r);
  for (const r of metaToEntryRows()) if (!localEntries.has(r.key)) localEntries.set(r.key, r);
  for (const [, r] of localEntries) entryMap.set(r.key, r);
  for (const r of remote.entries || []) {
    if (!r || typeof r.anime_id !== 'string' || !r.anime_id) continue;
    const cur = entryMap.get(r.key);
    if (!cur || num(r.updated_at) >= num(cur.updated_at)) {
      // jangan menurunkan favorit lokal bila remote hanya meta
      if (cur && cur.favorite && !r.favorite && num(r.updated_at) === num(cur.updated_at)) {
        entryMap.set(r.key, { ...r, favorite: true });
      } else {
        entryMap.set(r.key, r);
      }
      changed.v = true;
    }
  }
  const favs: FavItem[] = [];
  const meta: UserStatusMap = {};
  for (const r of entryMap.values()) {
    const { fav, meta: m } = rowToEntry(r);
    if (fav) favs.push(fav);
    if (m) meta[m.id] = { status: m.status, rating: m.rating, t: m.t };
  }
  favs.sort((a, b) => num(b.t) - num(a.t));

  /* progress: LWW per key */
  const contMap = new Map<string, ContinueItem>();
  for (const c of Store.cont) contMap.set(keyOf(c.provider, c.id), c);
  for (const r of remote.progress || []) {
    if (!r || typeof r.anime_id !== 'string' || !r.anime_id) continue;
    const cur = contMap.get(r.key);
    if (!cur || num(r.updated_at) >= num(cur.last || cur.t)) {
      contMap.set(r.key, rowToCont(r));
      changed.v = true;
    }
  }
  const cont = [...contMap.values()].sort((a, b) => num(b.last || b.t) - num(a.last || a.t));

  /* history: LWW per key (watched_at terbaru menang) */
  const histMap = new Map<string, HistItem>();
  for (const h of Store.hist) histMap.set(keyOf(h.provider, h.id), h);
  for (const r of remote.history || []) {
    if (!r || typeof r.anime_id !== 'string' || !r.anime_id) continue;
    const cur = histMap.get(r.key);
    if (!cur || num(r.watched_at) >= num(cur.t)) {
      histMap.set(r.key, rowToHist(r));
      changed.v = true;
    }
  }
  const hist = [...histMap.values()].sort((a, b) => num(b.t) - num(a.t));

  /* lists: union by id, LWW */
  const listMap = new Map<string, CustomList>();
  for (const l of LS.get<CustomList[]>('lists', []) || []) listMap.set(l.id, l);
  for (const r of remote.lists || []) {
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    const cur = listMap.get(r.id);
    if (!cur || num(r.updated_at) >= num(cur.updatedAt || cur.createdAt)) {
      listMap.set(r.id, { id: r.id, name: r.name || '', createdAt: num(r.created_at) || Date.now(), updatedAt: num(r.updated_at) || Date.now() });
      changed.v = true;
    }
  }

  /* settings: LWW per key */
  let shist = Store.shist;
  let seen = Store.seen;
  const cfgPatch: Partial<Config> = {};
  let hasCfg = false;
  for (const r of remote.settings || []) {
    if (!r || typeof r.key !== 'string') continue;
    if (r.key === 'shist' && Array.isArray(r.value)) {
      shist = r.value.map(String).slice(0, 20);
      changed.v = true;
    } else if (r.key === 'seen' && r.value && typeof r.value === 'object') {
      seen = r.value as Record<string, number>;
      changed.v = true;
    } else if (r.key === 'cfg' && r.value && typeof r.value === 'object') {
      Object.assign(cfgPatch, r.value as Partial<Config>);
      hasCfg = true;
      changed.v = true;
    }
  }

  return {
    favs,
    cont,
    hist,
    meta,
    shist,
    seen,
    cfg: hasCfg ? cfgPatch : {},
    lists: [...listMap.values()],
    changed: changed.v
  };
}

/**
 * Terapkan hasil merge ke Store + localStorage.
 * `res` sudah berisi union LWW lengkap (lokal ∪ remote) — jangan digabung ulang
 * dengan Store agar pemenang last-write-wins tidak tertimpa data basi.
 */
export function applyMergeToStore(res: MergeResult): void {
  Store.favs = dedupeFavs(res.favs);
  Store.cont = dedupeCont(res.cont);
  Store.hist = dedupeHist(res.hist);
  Store.meta = res.meta;
  Store.shist = res.shist.length ? res.shist : Store.shist;
  Store.seen = Object.keys(res.seen).length ? Object.assign({}, Store.seen, res.seen) : Store.seen;
  if (Object.keys(res.cfg).length) Store.cfg = Object.assign({}, Store.cfg, res.cfg);
  if (res.lists.length) LS.set('lists', res.lists);

  LS.set('favs', Store.favs);
  LS.set('hist', Store.hist);
  LS.set('cont', Store.cont);
  LS.set('meta', Store.meta);
  LS.set('shist', Store.shist);
  LS.set('seen', Store.seen);
  LS.set('cfg', Store.cfg);
}

function dedupeFavs(list: FavItem[]): FavItem[] {
  const m = new Map<string, FavItem>();
  for (const f of list) {
    const k = keyOf(f.provider, f.id);
    const cur = m.get(k);
    if (!cur || num(f.t) >= num(cur.t)) m.set(k, f);
  }
  return [...m.values()].sort((a, b) => num(b.t) - num(a.t)).slice(0, 300);
}
function dedupeCont(list: ContinueItem[]): ContinueItem[] {
  const m = new Map<string, ContinueItem>();
  for (const c of list) {
    const k = keyOf(c.provider, c.id);
    const cur = m.get(k);
    if (!cur || num(c.last || c.t) >= num(cur.last || cur.t)) m.set(k, c);
  }
  return [...m.values()].sort((a, b) => num(b.last || b.t) - num(a.last || a.t)).slice(0, 60);
}
function dedupeHist(list: HistItem[]): HistItem[] {
  const m = new Map<string, HistItem>();
  for (const h of list) {
    const k = keyOf(h.provider, h.id);
    const cur = m.get(k);
    if (!cur || num(h.t) >= num(cur.t)) m.set(k, h);
  }
  return [...m.values()].sort((a, b) => num(b.t) - num(a.t)).slice(0, 120);
}

/** Snapshot data lokal saat ini untuk migrasi tamu → akun. */
export interface LocalSnapshot {
  entries: EntryRow[];
  progress: ProgressRow[];
  history: HistoryRow[];
  lists: ListRow[];
  settings: SettingRow[];
}

export function snapshotLocal(): LocalSnapshot {
  const entries = favsToEntryRows().concat(metaToEntryRows());
  return {
    entries,
    progress: contToProgressRows(),
    history: histToHistoryRows(),
    lists: listsToRows(),
    settings: settingsToRows()
  };
}

export type { UserEntry, ProgressEntry, HistoryEntry, TableName };
