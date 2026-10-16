import { Store, LS } from '../core/store';
import { downloadJSON } from '../core/utils';
import { scheduleImportSync } from '../sync/migrate';
import {
  EXPORT_SCHEMA_VERSION,
  type ContinueItem,
  type CustomList,
  type ExportBundle,
  type FavItem,
  type HistItem,
  type HistoryEntry,
  type ProgressEntry,
  type UserEntry
} from '../core/types';

export { EXPORT_SCHEMA_VERSION };

function keyOf(provider: string, id: string): string {
  return (provider || '') + ':' + (id || '');
}

function toUserEntry(f: FavItem): UserEntry {
  const m = Store.meta[f.id];
  const t = f.t || Date.now();
  return {
    key: keyOf(f.provider, f.id),
    provider: f.provider || '',
    animeId: f.id,
    slug: f.slug || '',
    title: f.title || '',
    poster: f.cover || '',
    status: m?.status,
    rating: m?.rating,
    favorite: true,
    listIds: [],
    createdAt: t,
    updatedAt: t
  };
}

function toProgress(c: ContinueItem): ProgressEntry {
  const dur = c.dur || 0;
  const pct = Math.max(0, Math.min(100, c.pct || 0));
  const upd = c.last || c.t || Date.now();
  return {
    key: keyOf(c.provider, c.id),
    provider: c.provider || '',
    animeId: c.id,
    slug: c.slug || '',
    title: c.title || '',
    poster: c.cover || '',
    episode: c.ep,
    episodeId: c.eid || '',
    episodeSlug: c.eslug || '',
    positionSec: Math.round((dur * pct) / 100),
    durationSec: dur,
    percent: pct,
    completed: pct >= 95,
    updatedAt: upd
  };
}

function toHistory(h: HistItem): HistoryEntry {
  return {
    key: keyOf(h.provider, h.id),
    provider: h.provider || '',
    animeId: h.id,
    slug: h.slug || '',
    title: h.title || '',
    poster: h.cover || '',
    episode: h.ep,
    episodeId: h.eid || '',
    episodeSlug: h.eslug || '',
    watchedAt: h.t || 0
  };
}

function exportBundle(): ExportBundle {
  return {
    app: 'nanime',
    schema: EXPORT_SCHEMA_VERSION,
    at: Date.now(),
    entries: Store.favs.map(toUserEntry),
    progress: Store.cont.map(toProgress),
    history: Store.hist.map(toHistory),
    lists: LS.get<CustomList[]>('lists', []),
    searchHistory: Store.shist,
    seen: Store.seen,
    settings: Store.cfg
  };
}

export function exportData(): void {
  downloadJSON('nanime-backup-' + new Date().toISOString().slice(0, 10) + '.json', exportBundle());
}

export interface ImportResult {
  ok: boolean;
  message: string;
}

interface Incoming {
  favs: FavItem[];
  hist: HistItem[];
  cont: ContinueItem[];
  shist: string[];
  meta: Record<string, { status: 'ptw' | 'watching' | 'completed' | 'dropped'; rating: number; t: number }>;
  seen: Record<string, number>;
  cfg: Record<string, unknown>;
  lists: CustomList[];
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const STATUS_OK = new Set(['ptw', 'watching', 'completed', 'dropped']);

/** Baca bundle v3 (entries/progress/history) → struktur koleksi Store. */
function readV3(o: Record<string, unknown>): Incoming | string {
  const entries = o.entries;
  const progress = o.progress;
  const history = o.history;
  if (!isArr(entries) || !isArr(progress) || !isArr(history)) return 'Struktur entries/progress/history tidak dikenal.';

  const meta: Incoming['meta'] = {};
  const favs: FavItem[] = [];
  for (const raw of entries) {
    const e = raw as Partial<UserEntry>;
    if (!e || typeof e.animeId !== 'string' || !e.animeId) return 'Ada entri favorit tanpa animeId yang valid.';
    const provider = String(e.provider || '');
    const status = (e.status || 'ptw') as UserEntry['status'];
    meta[e.animeId] = {
      status: (STATUS_OK.has(String(status)) ? (status as 'ptw') : 'ptw'),
      rating: Math.max(0, Math.min(5, Number(e.rating) || 0)),
      t: Number(e.updatedAt) || Date.now()
    };
    if (e.favorite !== false) {
      favs.push({
        id: e.animeId,
        title: String(e.title || ''),
        cover: String(e.poster || ''),
        provider,
        score: '',
        epLabel: '',
        sub: '',
        type: '',
        slug: String(e.slug || ''),
        t: Number(e.createdAt) || Date.now()
      });
    }
  }

  const cont: ContinueItem[] = [];
  for (const raw of progress) {
    const p = raw as Partial<ProgressEntry>;
    if (!p || typeof p.animeId !== 'string' || !p.animeId) return 'Ada entri progres tanpa animeId yang valid.';
    cont.push({
      id: p.animeId,
      slug: String(p.slug || p.animeId),
      title: String(p.title || ''),
      cover: String(p.poster || ''),
      ep: String(p.episode || '1'),
      provider: String(p.provider || ''),
      eid: String(p.episodeId || ''),
      eslug: String(p.episodeSlug || ''),
      t: Number(p.updatedAt) || Date.now(),
      dur: Number(p.durationSec) || 0,
      pct: Math.max(0, Math.min(100, Number(p.percent) || 0)),
      last: Number(p.updatedAt) || Date.now()
    });
  }

  const hist: HistItem[] = [];
  for (const raw of history) {
    const h = raw as Partial<HistoryEntry>;
    if (!h || typeof h.animeId !== 'string' || !h.animeId) return 'Ada entri riwayat tanpa animeId yang valid.';
    hist.push({
      id: h.animeId,
      slug: String(h.slug || h.animeId),
      title: String(h.title || ''),
      cover: String(h.poster || ''),
      ep: String(h.episode || '1'),
      provider: String(h.provider || ''),
      eid: String(h.episodeId || ''),
      eslug: String(h.episodeSlug || ''),
      t: Number(h.watchedAt) || 0
    });
  }

  return {
    favs,
    hist,
    cont,
    shist: isArr(o.searchHistory) ? o.searchHistory.map(String).slice(0, 30) : [],
    meta,
    seen: (o.seen && typeof o.seen === 'object' ? o.seen : {}) as Record<string, number>,
    cfg: (o.settings && typeof o.settings === 'object' ? o.settings : {}) as Record<string, unknown>,
    lists: isArr(o.lists) ? (o.lists as CustomList[]).filter(l => l && typeof l.id === 'string') : []
  };
}

/** Baca bundle v2 lama (favs/hist/…) → struktur koleksi Store. */
function readV2(o: Record<string, unknown>): Incoming | string {
  const favs = o.favs;
  const hist = o.hist;
  if (!isArr(favs) || !isArr(hist)) return 'Struktur favorit/riwayat tidak dikenal.';
  const meta = (o.meta && typeof o.meta === 'object' ? o.meta : {}) as Incoming['meta'];
  return {
    favs: (favs as FavItem[]).slice(0, 220),
    hist: (hist as HistItem[]).slice(0, 60),
    cont: isArr(o.cont) ? (o.cont as ContinueItem[]).slice(0, 30) : [],
    shist: isArr(o.shist) ? (o.shist as string[]).slice(0, 10).map(String) : [],
    meta,
    seen: (o.seen && typeof o.seen === 'object' ? o.seen : {}) as Record<string, number>,
    cfg: (o.cfg && typeof o.cfg === 'object' ? o.cfg : {}) as Record<string, unknown>,
    lists: []
  };
}

/**
 * Terapkan cadangan. Seluruh validasi dijalankan sebelum menyentuh Store —
 * impor yang gagal tidak pernah menghapus/menimpa data lokal.
 */
export function applyImport(raw: unknown): ImportResult {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'File bukan objek JSON yang valid.' };
  const o = raw as Record<string, unknown>;
  if (o.app && o.app !== 'nanime') return { ok: false, message: 'File ini bukan cadangan Nanime.' };

  const schema = Number(o.schema) || 0;
  const isV3 = schema >= EXPORT_SCHEMA_VERSION || 'entries' in o;
  const parsed = isV3 ? readV3(o) : readV2(o);
  if (typeof parsed === 'string') return { ok: false, message: parsed };

  try {
    Store.favs = parsed.favs.slice(0, 300);
    Store.hist = parsed.hist.slice(0, 100);
    Store.cont = parsed.cont.slice(0, 50);
    Store.shist = parsed.shist;
    Store.meta = parsed.meta;
    Store.seen = parsed.seen;
    Store.cfg = Object.assign({}, Store.cfg, parsed.cfg);

    LS.set('favs', Store.favs);
    LS.set('hist', Store.hist);
    LS.set('cont', Store.cont);
    LS.set('shist', Store.shist);
    LS.set('meta', Store.meta);
    LS.set('seen', Store.seen);
    LS.set('cfg', Store.cfg);
    LS.set('lists', parsed.lists);
  } catch (e) {
    return { ok: false, message: 'Gagal menyimpan data: ' + ((e as Error)?.message || 'tidak diketahui') };
  }

  return {
    ok: true,
    message:
      Store.favs.length + ' favorit, ' + Store.hist.length + ' riwayat & ' + Store.cont.length +
      ' lanjutan tonton dipulihkan (skema v' + (isV3 ? EXPORT_SCHEMA_VERSION : 2) + ').'
  };
}

export async function importFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    const res = applyImport(JSON.parse(text));
    if (res.ok) scheduleImportSync();
    return res;
  } catch {
    return { ok: false, message: 'File tidak bisa dibaca sebagai JSON.' };
  }
}
