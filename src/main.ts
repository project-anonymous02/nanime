import './styles/index.css';
import { Store } from './core/store';
import { svg } from './core/icons';
import { go } from './core/router';
import { render, bindGlobal } from './app';
import { toast } from './ui/toast';
import { openSettings, applyTheme } from './features/settings';
import { bindShortcuts, bindPaletteClicks, setCommands, openPalette } from './features/shortcuts';
import { setNotifier, startNotifyLoop, checkNewEpisodes, clearNewEpisodes } from './features/notify';
import { initPWA } from './features/pwa';
import { exportData } from './features/exportImport';
import { homeRandom } from './views/home';
import { isConfigured, initAuth, startSync, exchangeCode } from './sync';

function buildCommands(): void {
  setCommands([
    { id: 'home', label: 'Beranda', icon: 'home', group: 'Navigasi', kbd: 'g h', run: () => go('/home') },
    { id: 'search', label: 'Cari anime', icon: 'search', group: 'Navigasi', kbd: '/', run: () => go('/search') },
    { id: 'explore', label: 'Jelajah katalog & genre', icon: 'explore', group: 'Navigasi', kbd: 'g e', run: () => go('/explore') },
    { id: 'schedule', label: 'Jadwal rilis mingguan', icon: 'cal', group: 'Navigasi', kbd: 'g j', run: () => go('/schedule') },
    { id: 'favorite', label: 'Favorit saya', icon: 'heart', group: 'Navigasi', kbd: 'g f', run: () => go('/favorite') },
    { id: 'history', label: 'Riwayat tonton', icon: 'clock', group: 'Navigasi', kbd: 'g r', run: () => go('/history') },
    { id: 'stats', label: 'Statistik menonton', icon: 'chart', group: 'Navigasi', kbd: 'g s', run: () => go('/stats') },
    { id: 'palette', label: 'Buka perintah cepat', icon: 'keyboard', group: 'Aksi', kbd: '?', run: openPalette },
    { id: 'random', label: 'Acak anime untuk ditonton', icon: 'dice', group: 'Aksi', run: homeRandom },
    { id: 'settings', label: 'Pengaturan aplikasi', icon: 'settings', group: 'Aksi', kbd: 's', run: openSettings },
    { id: 'export', label: 'Ekspor data (favorit & riwayat)', icon: 'download', group: 'Aksi', run: () => { exportData(); toast('Cadangan diunduh.', 'ok'); } },
    { id: 'refresh', label: 'Muat ulang halaman', icon: 'refresh', group: 'Aksi', kbd: 'r', run: () => location.reload() }
  ]);
}

let deferredInstall: any = null;

/** Tangani kembali-redirect OAuth (?code=... atau #code=...) → tukar jadi sesi. */
async function handleOAuthRedirect(): Promise<void> {
  if (!isConfigured()) return;
  let code: string | null = null;
  try {
    const u = new URL(location.href);
    code = u.searchParams.get('code');
    if (!code && u.hash) {
      const hp = new URLSearchParams(u.hash.replace(/^#\/?/, ''));
      code = hp.get('code');
    }
  } catch {
    /* noop */
  }
  if (!code) return;
  try {
    history.replaceState(null, '', location.pathname + '#/home');
  } catch {
    /* noop */
  }
  const res = await exchangeCode(code);
  if (res.ok) {
    toast(res.message, 'ok', 'Masuk akun');
    setTimeout(() => location.reload(), 800);
  } else {
    toast(res.message, 'err', 'Masuk gagal');
  }
}

/** Pasang listener deep-link native (nanime://) untuk alur OAuth Android. */
function bindNativeDeepLink(): void {
  try {
    const cap = (globalThis as any).Capacitor;
    const App = (globalThis as any).NanimeAppPlugin || null;
    // @capacitor/app diimpor dinamis agar build web tetap ringan & tanpa error.
    void import('@capacitor/app')
      .then(mod => {
        const AppPlugin = mod.App;
        void AppPlugin.addListener('appUrlOpen', async ({ url }: { url: string }) => {
          let code: string | null = null;
          try {
            const u = new URL(url);
            code = u.searchParams.get('code') || u.searchParams.get('code');
            if (!code && u.hash) code = new URLSearchParams(u.hash.slice(1)).get('code');
          } catch {
            /* noop */
          }
          if (!code) return;
          const res = await exchangeCode(code);
          if (res.ok) {
            toast(res.message, 'ok', 'Masuk akun');
            try {
              const Browser = await import('@capacitor/browser');
              void Browser.Browser.close();
            } catch {
              /* noop */
            }
            setTimeout(() => location.reload(), 800);
          } else {
            toast(res.message, 'err', 'Masuk gagal');
          }
        });
        void cap;
        void App;
      })
      .catch(() => {
        /* plugin tidak tersedia di web — abaikan */
      });
  } catch {
    /* noop */
  }
}

function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredInstall = e;
    toast('Ketuk ikon ⋮ lalu "Tambahkan ke layar utama" untuk memasang Nanime.', 'info', 'Pasang Aplikasi');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    toast('Nanime terpasang di perangkatmu.', 'ok');
  });
}

function boot(): void {
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (Store.cfg.theme === 'system') applyTheme();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  setNotifier(toast);
  buildCommands();
  bindShortcuts();
  bindPaletteClicks();
  bindGlobal();
  captureInstallPrompt();
  initPWA();
  startNotifyLoop();

  // Supabase: inisialisasi sesi, engine sinkronisasi, dan tangani redirect OAuth.
  if (isConfigured()) {
    void initAuth().then(() => startSync());
    void handleOAuthRedirect();
    bindNativeDeepLink();
  }

  if (!location.hash) location.replace('#/home');
  render();

  if (Store.cfg.notify) {
    setTimeout(() => checkNewEpisodes(false), 4000);
  }

  window.addEventListener('online', () => {
    toast('Kembali online — menyambungkan ulang ke sumber otomatis…', 'info');
  });
  document.addEventListener('nanime:clear-new' as any, clearNewEpisodes);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
