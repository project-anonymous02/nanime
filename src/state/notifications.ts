import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Status notifikasi — mana yang sudah dibaca / dihapus pengguna.
 * Disimpan lokal (localStorage) supaya tidak "muncul lagi" setelah restart,
 * sekaligus menjadi sumber kebenaran titik merah lonceng di beranda.
 */

const CAP = 400;

interface NotifState {
  /** canonicalId yang sudah dibaca (dibuka atau "Baca semua"). */
  read: string[];
  /** canonicalId yang dihapus pengguna (tombol tempat sampah). */
  removed: string[];

  markRead(ids: string[]): void;
  remove(id: string): void;
  reset(): void;
}

const clip = (ids: string[]) => Array.from(new Set(ids)).slice(-CAP);

export const useNotifications = create<NotifState>()(
  persist(
    (set) => ({
      read: [],
      removed: [],

      markRead(ids) {
        if (!ids.length) return;
        set(s => ({ read: clip([...s.read, ...ids]) }));
      },

      remove(id) {
        set(s => ({ removed: clip([...s.removed, id]), read: clip([...s.read, id]) }));
      },

      reset() {
        set({ read: [], removed: [] });
      }
    }),
    { name: 'nanime.v2.notifications' }
  )
);
