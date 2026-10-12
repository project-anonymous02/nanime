import './styles/index.css';
import { PROVIDERS } from './core/config';
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

  if (!location.hash) location.replace('#/home');
  render();

  if (Store.cfg.notify) {
    setTimeout(() => checkNewEpisodes(false), 4000);
  }

  window.addEventListener('online', () => {
    toast('Menghubungkan ulang ke ' + PROVIDERS[Store.getProvider()].name + '…', 'info');
  });
  document.addEventListener('nanime:clear-new' as any, clearNewEpisodes);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
