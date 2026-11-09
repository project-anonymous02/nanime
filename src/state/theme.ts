import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nanime.v2.theme';

const THEME_META_COLOR: Record<ThemeMode, string> = {
  light: '#F2F2F7',
  dark: '#000000'
};

function resolveStoredTheme(): ThemeMode {
  try {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') return attr;
    }
  } catch {
    /* DOM belum tersedia */
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { theme?: string } };
        if (parsed?.state?.theme === 'dark' || parsed?.state?.theme === 'light') {
          return parsed.state.theme;
        }
      }
    }
  } catch {
    /* storage tidak tersedia: pakai light */
  }
  return 'light';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  try {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META_COLOR[theme]);
  } catch {
    /* abaikan */
  }
  try {
    const scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', theme);
  } catch {
    /* abaikan */
  }
}

interface ThemeState {
  theme: ThemeMode;
  setTheme(theme: ThemeMode): void;
  toggleTheme(): void;
}

const initialTheme = resolveStoredTheme();

export const useTheme = create<ThemeState>()(
  persist(
    set => ({
      theme: initialTheme,
      setTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        set({ theme });
        applyTheme(theme);
      },
      toggleTheme() {
        const next = useTheme.getState().theme === 'dark' ? 'light' : 'dark';
        useTheme.getState().setTheme(next);
      }
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      // Simpan hanya preferensi tema (bukan aksi store).
      partialize: state => ({ theme: state.theme })
    }
  )
);

try {
  applyTheme(useTheme.getState().theme);
} catch {
  /* abaikan */
}
