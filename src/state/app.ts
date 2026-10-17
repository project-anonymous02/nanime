import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferensi aplikasi tingkat perangkat (tidak disinkronkan):
 *  • onboarded — pengenalan awal sudah dilewati.
 *  • mode      — SINGLE (satu sumber utama) / MULTI (gabungan semua sumber).
 */

export type PlayMode = 'single' | 'multi';

interface AppState {
  onboarded: boolean;
  mode: PlayMode;
  markOnboarded(): void;
  setMode(mode: PlayMode): void;
}

export const useApp = create<AppState>()(
  persist(
    set => ({
      onboarded: false,
      mode: 'multi',
      markOnboarded() {
        set({ onboarded: true });
      },
      setMode(mode) {
        set({ mode });
      }
    }),
    { name: 'nanime.v2.app' }
  )
);
