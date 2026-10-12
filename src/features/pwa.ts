import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { toast } from '../ui/toast';

let swReady = false;
let updateReady: (() => void) | null = null;

/** Pasang service worker bila tersedia (dipakai saat di-serve over http/https). */
export function initPWA(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(
      reg => {
        swReady = true;
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(() => {
                w.postMessage({ type: 'SKIP_WAITING' });
              });
            }
          });
        });
      },
      () => {
        /* di-host statis tanpa sw.js — abaikan */
      }
    );

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateReady) {
        updateReady();
        updateReady = null;
      }
    });
  });

  window.addEventListener('offline', () => showOfflineBanner(true));
  window.addEventListener('online', () => {
    showOfflineBanner(false);
    toast('Koneksi internet pulih.', 'ok');
  });
  if (!navigator.onLine) setTimeout(() => showOfflineBanner(true), 400);
}

function ensureHost(): HTMLElement {
  let host = document.getElementById('netBanners');
  if (!host) {
    host = document.createElement('div');
    host.id = 'netBanners';
    const view = document.getElementById('view');
    if (view && view.parentElement) view.parentElement.insertBefore(host, view);
    else document.body.appendChild(host);
    host.style.cssText = 'position:fixed;left:0;right:0;top:calc(var(--top-h) + 6px);z-index:150;display:flex;flex-direction:column;gap:8px;padding:0 14px;pointer-events:none';
  }
  return host;
}

function showOfflineBanner(on: boolean): void {
  const host = ensureHost();
  const el = document.getElementById('netOff');
  if (!on) {
    if (el) el.remove();
    return;
  }
  if (el) return;
  host.insertAdjacentHTML(
    'beforeend',
    '<div class="banner err" id="netOff" style="pointer-events:auto;margin-top:0">' +
      svg('globe', '', 2) + '<span class="sp">Koneksi terputus. Data yang sudah di-cache masih bisa dibuka.</span>' +
      '<button class="btn ghost sm" data-act="net-retry">Coba lagi</button></div>'
  );
}

function showUpdateBanner(reload: () => void): void {
  const host = ensureHost();
  if (document.getElementById('netUpd')) return;
  host.insertAdjacentHTML(
    'beforeend',
    '<div class="banner ok" id="netUpd" style="pointer-events:auto;margin-top:0">' +
      svg('bolt', '', 2) + '<span class="sp">Versi baru tersedia.</span>' +
      '<button class="btn ghost sm" id="netUpdBtn">Muat ulang</button></div>'
  );
  updateReady = reload;
  const btn = document.getElementById('netUpdBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (updateReady) updateReady();
      location.reload();
    });
  }
}

export function isPWA(): boolean {
  return swReady || window.matchMedia('(display-mode: standalone)').matches;
}

export function promptInstall(): string {
  return navigator.onLine
    ? 'Buka menu browser lalu pilih "Tambahkan ke layar utama" untuk memasang aplikasi.'
    : esc('Instalasi butuh koneksi internet saat pertama kali.');
}
