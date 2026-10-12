import { Store } from '../core/store';
import { downloadJSON } from '../core/utils';

export interface ExportBundle {
  app: 'nanime';
  v: 2;
  at: number;
  favs: unknown;
  hist: unknown;
  cont: unknown;
  meta: unknown;
  shist: unknown;
  cfg: unknown;
}

export function exportData(): void {
  const bundle: ExportBundle = {
    app: 'nanime',
    v: 2,
    at: Date.now(),
    favs: Store.favs,
    hist: Store.hist,
    cont: Store.cont,
    meta: Store.meta,
    shist: Store.shist,
    cfg: Store.cfg
  };
  downloadJSON('nanime-backup-' + new Date().toISOString().slice(0, 10) + '.json', bundle);
}

function pick<T>(raw: unknown, key: string, fallback: T): T {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return fallback;
  const v = o[key];
  return (v == null ? fallback : v) as T;
}

export interface ImportResult {
  ok: boolean;
  message: string;
}

export function applyImport(raw: unknown): ImportResult {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'File bukan objek JSON yang valid.' };
  const o = raw as Record<string, unknown>;
  if (o.app && o.app !== 'nanime') return { ok: false, message: 'File ini bukan cadangan Nanime.' };

  const favs = pick(o, 'favs', [] as any[]);
  const hist = pick(o, 'hist', [] as any[]);
  const cont = pick(o, 'cont', [] as any[]);
  const shist = pick(o, 'shist', [] as any[]);
  const meta = pick(o, 'meta', {} as Record<string, unknown>);
  const cfg = pick(o, 'cfg', {} as Record<string, unknown>);

  if (!Array.isArray(favs) || !Array.isArray(hist)) return { ok: false, message: 'Struktur favorit/riwayat tidak dikenal.' };

  Store.favs = favs.slice(0, 220);
  Store.hist = hist.slice(0, 60);
  Store.cont = Array.isArray(cont) ? cont.slice(0, 30) : [];
  Store.shist = Array.isArray(shist) ? shist.slice(0, 10).map(String) : [];
  Store.meta = meta && typeof meta === 'object' ? (meta as typeof Store.meta) : {};
  Store.cfg = Object.assign({}, Store.cfg, cfg && typeof cfg === 'object' ? cfg : {});

  localStorage.setItem('nanime.v2.favs', JSON.stringify(Store.favs));
  localStorage.setItem('nanime.v2.hist', JSON.stringify(Store.hist));
  localStorage.setItem('nanime.v2.cont', JSON.stringify(Store.cont));
  localStorage.setItem('nanime.v2.shist', JSON.stringify(Store.shist));
  localStorage.setItem('nanime.v2.meta', JSON.stringify(Store.meta));
  localStorage.setItem('nanime.v2.cfg', JSON.stringify(Store.cfg));

  return {
    ok: true,
    message: Store.favs.length + ' favorit & ' + Store.hist.length + ' riwayat dipulihkan.'
  };
}

export async function importFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return applyImport(JSON.parse(text));
  } catch {
    return { ok: false, message: 'File tidak bisa dibaca sebagai JSON.' };
  }
}
