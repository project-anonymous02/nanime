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

/**
 * Ambil ?code= (atau #code=) dari sebuah URL, baik format web
 * (`#/auth/callback?code=…`) maupun deep-link native (`nanime://auth-callback?code=…`).
 */
function extractAuthCode(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl, location.origin);
    let code = u.searchParams.get('code');
    if (!code && u.hash) {
      const hi = u.hash.indexOf('?');
      const hq = hi > -1 ? u.hash.slice(hi + 1) : u.hash.replace(/^#\/?/, '');
      code = new URLSearchParams(hq).get('code');
    }
    return code;
  } catch {
    return null;
  }
}

/** Pesan error OAuth (bila Supabase mengembalikan error di redirect). */
function extractAuthError(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl, location.origin);
    const q = u.searchParams.get('error_description') || u.searchParams.get('error');
    if (q) return u.searchParams.get('error_description') || q;
    if (u.hash.indexOf('error') > -1) {
      const hi = u.hash.indexOf('?');
      const hq = hi > -1 ? u.hash.slice(hi + 1) : u.hash.replace(/^#\/?/, '');
      const p = new URLSearchParams(hq);
      return p.get('error_description') || p.get('error') || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Tukar kode OAuth menjadi sesi, tampilkan pesan, lalu muat ulang. */
async function consumeAuthUrl(rawUrl: string): Promise<boolean> {
  const err = extractAuthError(rawUrl);
  if (err) {
    toast(err, 'err', 'Masuk gagal');
    return false;
  }
  const code = extractAuthCode(rawUrl);
  if (!code) return false;
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
    return true;
  }
  toast(res.message, 'err', 'Masuk gagal');
  return false;
}

/** Tangani kembali-redirect OAuth (?code=... atau #code=...) pada web. */
async function handleOAuthRedirect(): Promise<void> {
  if (!isConfigured()) return;
  if (!extractAuthCode(location.href) && !extractAuthError(location.href)) return;
  try {
    history.replaceState(null, '', location.pathname + '#/home');
  } catch {
    /* noop */
  }
  await consumeAuthUrl(location.href);
}

/** Pasang listener deep-link native (nanime://) untuk alur OAuth Android. */
function bindNativeDeepLink(): void {
  void import('@capacitor/app')
    .then(mod => {
      const AppPlugin = mod.App;
      // Deep-link saat aplikasi dingin (cold start): app dibuka dari tautan callback.
      void AppPlugin.getLaunchUrl()
        .then(res => {
          if (res && res.url) void consumeAuthUrl(res.url);
        })
        .catch(() => {
          /* noop */
        });
      // Deep-link saat aplikasi sudah berjalan.
      AppPlugin.addListener('appUrlOpen', (data: { url?: string }) => {
        if (data && data.url) void consumeAuthUrl(data.url);
      });
    })
    .catch(() => {
      /* plugin tidak tersedia di web — abaikan */
    });
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
