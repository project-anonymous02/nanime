import type { Config, ContinueItem, FavItem, HistItem } from './types';

const P = 'nanime.v2.';

export const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(P + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(P + k, JSON.stringify(v));
    } catch {
      /* kuota penuh — abaikan */
    }
  },
  del(k: string): void {
    try {
      localStorage.removeItem(P + k);
    } catch {
      /* noop */
    }
  }
};

/** migrasi data dari versi lama (nanime.v1.*) supaya favorit/riwayat tidak hilang */
function migrate(): void {
  try {
    if (localStorage.getItem(P + 'migrated')) return;
    const map: [string, string][] = [
      ['favs', 'favs'],
      ['hist', 'hist'],
      ['shist', 'shist'],
      ['cfg', 'cfg']
    ];
    map.forEach(([oldKey, newKey]) => {
      const raw = localStorage.getItem('nanime.v1.' + oldKey);
      if (raw != null && localStorage.getItem(P + newKey) == null) {
        localStorage.setItem(P + newKey, raw);
      }
    });
    localStorage.setItem(P + 'migrated', '1');
  } catch {
    /* noop */
  }
}
migrate();

export const DEFAULT_CFG: Config = {
  provider: 'otakudesu',
  autoNext: true,
  autoplay: true,
  theme: 'dark',
  accent: '#3E7BFA',
  dataSaver: false,
  notify: false,
  notifyInterval: 15,
  defaultQuality: '',
  keepHistory: true
};

export interface UserStatusMap {
  [id: string]: { status: 'ptw' | 'watching' | 'completed' | 'dropped'; rating: number; t: number };
}

/** Jenis koleksi data yang dapat berubah pada Store. */
export type StoreCollection = 'favs' | 'hist' | 'cont' | 'meta' | 'cfg' | 'seen' | 'shist' | 'lists' | 'clear';

type StoreListener = (c: StoreCollection) => void;

class StoreImpl {
  favs: FavItem[] = LS.get<FavItem[]>('favs', []);
  hist: HistItem[] = LS.get<HistItem[]>('hist', []);
  shist: string[] = LS.get<string[]>('shist', []);
  cont: ContinueItem[] = LS.get<ContinueItem[]>('cont', []);
  meta: UserStatusMap = LS.get<UserStatusMap>('meta', {});
  cfg: Config = this.readConfig();
  seen: Record<string, number> = LS.get<Record<string, number>>('seen', {});

  private listeners = new Set<StoreListener>();

  /** Daftarkan listener perubahan koleksi (dipakai SyncEngine untuk sinkronisasi). */
  onChange(cb: StoreListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(c: StoreCollection): void {
    for (const cb of this.listeners) {
      try {
        cb(c);
      } catch {
        /* listener error tidak boleh merusak alur simpan */
      }
    }
  }

  private readConfig(): Config {
    const saved = LS.get<Partial<Config> & { apiBase?: unknown }>('cfg', {});
    delete saved.apiBase;
    // Older builds saved remote API bases. Remove these stale values entirely.
    LS.del('apiWin.wajik');
    LS.del('apiWin.kusonime');
    const cfg = Object.assign({}, DEFAULT_CFG, saved);
    LS.set('cfg', cfg);
    return cfg;
  }

  isFav(id: string, provider?: string): boolean {
    return this.favs.some(f => f.id === id && (f.provider || '') === (provider || ''));
  }

  toggleFav(a: FavItem): boolean {
    const i = this.favs.findIndex(f => f.id === a.id && (f.provider || '') === (a.provider || ''));
    if (i > -1) {
      this.favs.splice(i, 1);
      LS.set('favs', this.favs);
      this.emit('favs');
      return false;
    }
    this.favs.unshift(Object.assign({ t: Date.now() }, a));
    if (this.favs.length > 220) this.favs.length = 220;
    LS.set('favs', this.favs);
    this.emit('favs');
    return true;
  }

  addHist(o: HistItem): void {
    if (!this.cfg.keepHistory) return;
    this.hist = this.hist.filter(h => !(h.id === o.id && (h.provider || '') === (o.provider || '')));
    this.hist.unshift(Object.assign({ t: Date.now() }, o));
    if (this.hist.length > 60) this.hist.length = 60;
    LS.set('hist', this.hist);
    this.emit('hist');
  }

  removeHist(id: string, provider?: string): void {
    this.hist = this.hist.filter(h => !(h.id === id && (h.provider || '') === (provider || '')));
    LS.set('hist', this.hist);
    this.emit('hist');
  }

  addQ(q: string): void {
    q = String(q || '').trim();
    if (q.length < 2) return;
    this.shist = this.shist.filter(x => String(x).toLowerCase() !== q.toLowerCase());
    this.shist.unshift(q);
    if (this.shist.length > 10) this.shist.length = 10;
    LS.set('shist', this.shist);
    this.emit('shist');
  }

  clearQ(): void {
    this.shist = [];
    LS.set('shist', []);
    this.emit('shist');
  }

  /* ── lanjutkan menonton ── */
  saveProgress(o: ContinueItem): void {
    const key = (x: ContinueItem) => x.id + '|' + (x.provider || '');
    this.cont = this.cont.filter(c => key(c) !== key(o));
    this.cont.unshift(Object.assign({ last: Date.now() }, o));
    if (this.cont.length > 30) this.cont.length = 30;
    LS.set('cont', this.cont);
    this.emit('cont');
  }

  removeProgress(id: string, provider?: string): void {
    this.cont = this.cont.filter(c => !(c.id === id && (c.provider || '') === (provider || '')));
    LS.set('cont', this.cont);
    this.emit('cont');
  }

  /* ── meta personal (status + rating) ── */
  setMeta(id: string, patch: Partial<{ status: 'ptw' | 'watching' | 'completed' | 'dropped'; rating: number }>): void {
    const cur = this.meta[id] || { status: 'ptw' as const, rating: 0, t: Date.now() };
    this.meta[id] = Object.assign({}, cur, patch, { t: Date.now() });
    if (Object.keys(this.meta).length > 400) {
      const keys = Object.keys(this.meta).sort((a, b) => this.meta[a].t - this.meta[b].t);
      delete this.meta[keys[0]];
    }
    LS.set('meta', this.meta);
    this.emit('meta');
  }

  /* ── penanda episode baru ── */
  markSeen(key: string): number {
    const prev = this.seen[key] || 0;
    return prev;
  }

  setSeen(key: string, n: number): void {
    this.seen[key] = n;
    LS.set('seen', this.seen);
    this.emit('seen');
  }

  setCfg<K extends keyof Config>(k: K, v: Config[K]): void {
    (this.cfg as any)[k] = v;
    LS.set('cfg', this.cfg);
    this.emit('cfg');
  }

  getProvider(): string {
    const p = this.cfg.provider;
    return p && p !== 'kusonime' ? p : 'otakudesu';
  }

  clearAll(): void {
    ['favs', 'hist', 'shist', 'cont', 'meta', 'seen'].forEach(k => LS.del(k));
    this.favs = [];
    this.hist = [];
    this.shist = [];
    this.cont = [];
    this.meta = {};
    this.seen = {};
    this.emit('clear');
  }
}

export const Store = new StoreImpl();

export function storageSize(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(P) === 0) total += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
  } catch {
    /* noop */
  }
  return total;
}
