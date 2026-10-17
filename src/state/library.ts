import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { favorites as remoteFavorites, history as remoteHistory } from '../lib/remote';
import type { FavAnime, HistoryItem } from '../lib/remote/types';
import { currentUserId } from './auth';

/**
 * Library pengguna — favorit + riwayat menonton (dengan progress detik).
 * Lokal-first (selalu tersedia offline) dengan sinkronisasi diam-diam ke server
 * memakai strategi last-write-wins per baris. Tombstone mencegah data yang
 * dihapus muncul kembali saat rekonsiliasi.
 */

type Tomb = Record<string, number>;

interface LibraryState {
  favorites: FavAnime[];
  history: HistoryItem[];
  tombstones: { fav: Tomb; hist: Tomb };

  isFavorite(id: string): boolean;
  toggleFavorite(item: Omit<FavAnime, 'addedAt' | 'updatedAt'>): void;
  addHistory(item: Omit<HistoryItem, 'updatedAt'>): void;
  removeHistory(keys: { animeId: string; episode: string }[]): void;
  clearHistory(): void;
  reconcile(userId: string): Promise<void>;
  purge(): void;
}

const HIST_KEY = (h: { animeId: string; episode: string }) => h.animeId + '|' + h.episode;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      history: [],
      tombstones: { fav: {}, hist: {} },

      isFavorite(id) {
        return get().favorites.some(f => f.id === id);
      },

      toggleFavorite(item) {
        const uid = currentUserId();
        const list = get().favorites;
        const exists = list.find(f => f.id === item.id);
        if (exists) {
          set(s => ({
            favorites: s.favorites.filter(f => f.id !== item.id),
            tombstones: { ...s.tombstones, fav: { ...s.tombstones.fav, [item.id]: Date.now() } }
          }));
          if (uid) void remoteFavorites.remove(uid, item.id).catch(() => {});
          return;
        }
        const now = Date.now();
        const next: FavAnime = { ...item, addedAt: now, updatedAt: now };
        set(s => {
          const fav = { ...s.tombstones.fav };
          delete fav[item.id];
          return {
            favorites: [next, ...s.favorites],
            tombstones: { ...s.tombstones, fav }
          };
        });
        if (uid) void remoteFavorites.upsert(uid, next).catch(() => {});
      },

      addHistory(item) {
        const uid = currentUserId();
        const now = Date.now();
        const next: HistoryItem = { ...item, updatedAt: now };
        set(s => {
          const rest = s.history.filter(h => HIST_KEY(h) !== HIST_KEY(item));
          const hist = { ...s.tombstones.hist };
          delete hist[HIST_KEY(item)];
          return { history: [next, ...rest].slice(0, 500), tombstones: { ...s.tombstones, hist } };
        });
        if (uid) void remoteHistory.upsert(uid, next).catch(() => {});
      },

      removeHistory(keys) {
        const uid = currentUserId();
        const keySet = new Set(keys.map(HIST_KEY));
        const dead: Tomb = {};
        const now = Date.now();
        keys.forEach(k => {
          dead[HIST_KEY(k)] = now;
        });
        set(s => ({
          history: s.history.filter(h => !keySet.has(HIST_KEY(h))),
          tombstones: { ...s.tombstones, hist: { ...s.tombstones.hist, ...dead } }
        }));
        if (uid) {
          keys.forEach(k => {
            void remoteHistory.remove(uid, k.animeId, k.episode).catch(() => {});
          });
        }
      },

      clearHistory() {
        const uid = currentUserId();
        const dead: Tomb = {};
        const now = Date.now();
        get().history.forEach(h => {
          dead[HIST_KEY(h)] = now;
        });
        set(s => ({ history: [], tombstones: { ...s.tombstones, hist: { ...s.tombstones.hist, ...dead } } }));
        if (uid) void remoteHistory.clear(uid).catch(() => {});
      },

      /** Gabungkan data server dengan lokal (last-write-wins), lalu dorong yang lebih baru. */
      async reconcile(userId) {
        try {
          const [remoteFavs, remoteHist] = await Promise.all([
            remoteFavorites.pull(userId),
            remoteHistory.pull(userId)
          ]);

          const favMap = new Map<string, FavAnime>();
          remoteFavs.forEach(f => favMap.set(f.id, f));
          get().favorites.forEach(f => {
            const r = favMap.get(f.id);
            if (!r || f.updatedAt >= r.updatedAt) favMap.set(f.id, f);
          });

          const histMap = new Map<string, HistoryItem>();
          remoteHist.forEach(h => histMap.set(HIST_KEY(h), h));
          get().history.forEach(h => {
            const r = histMap.get(HIST_KEY(h));
            if (!r || h.updatedAt >= r.updatedAt) histMap.set(HIST_KEY(h), h);
          });

          const tombstones = get().tombstones;
          for (const [id, ts] of Object.entries(tombstones.fav)) {
            const r = favMap.get(id);
            if (r && r.updatedAt <= ts) {
              favMap.delete(id);
              void remoteFavorites.remove(userId, id).catch(() => {});
            }
          }
          for (const [key, ts] of Object.entries(tombstones.hist)) {
            const r = histMap.get(key);
            if (r && r.updatedAt <= ts) {
              histMap.delete(key);
              const [animeId, episode] = key.split('|');
              if (animeId && episode) void remoteHistory.remove(userId, animeId, episode).catch(() => {});
            }
          }

          const favorites = Array.from(favMap.values()).sort((a, b) => b.addedAt - a.addedAt);
          const history = Array.from(histMap.values()).sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 500);
          set({ favorites, history });

          /* Dorong milik lokal yang menang agar server sepadan. */
          favorites.forEach(f => {
            const r = remoteFavs.find(x => x.id === f.id);
            if (!r || f.updatedAt > r.updatedAt) void remoteFavorites.upsert(userId, f).catch(() => {});
          });
          history.forEach(h => {
            const r = remoteHist.find(x => HIST_KEY(x) === HIST_KEY(h));
            if (!r || h.updatedAt > r.updatedAt) void remoteHistory.upsert(userId, h).catch(() => {});
          });
        } catch {
          /* offline: data lokal tetap dipakai */
        }
      },

      purge() {
        set({ favorites: [], history: [], tombstones: { fav: {}, hist: {} } });
      }
    }),
    { name: 'nanime.v2.library' }
  )
);
