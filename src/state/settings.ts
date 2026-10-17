import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, type UserSettings } from '../lib/remote/types';
import { settings as remoteSettings } from '../lib/remote';
import { currentUserId } from './auth';

interface SettingsState extends UserSettings {
  patch(p: Partial<UserSettings>): void;
  reconcile(userId: string): Promise<void>;
  reset(): void;
}

/** Pengaturan aplikasi (lokal-first, disinkronkan diam-diam bila masuk akun). */
export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      patch(p) {
        set(p);
        const uid = currentUserId();
        if (!uid) return;
        const value: UserSettings = {
          autoplayNext: get().autoplayNext,
          playerControls: get().playerControls,
          skipIntro: get().skipIntro,
          introDuration: get().introDuration,
          defaultQuality: get().defaultQuality
        };
        void remoteSettings.push(uid, value).catch(() => {
          /* offline: tetap tersimpan lokal */
        });
      },

      async reconcile(userId) {
        try {
          const remote = await remoteSettings.pull(userId);
          if (remote) set({ ...DEFAULT_SETTINGS, ...remote });
        } catch {
          /* offline: pakai lokal */
        }
      },

      reset() {
        set({ ...DEFAULT_SETTINGS });
      }
    }),
    { name: 'nanime.v2.settings' }
  )
);
