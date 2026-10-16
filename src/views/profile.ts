import { PROVIDERS } from '../core/config';
import { Store } from '../core/store';
import { esc } from '../core/utils';
import { svg, googleLogoSVG } from '../core/icons';
import { initView } from '../ui/dom';
import { footerHTML } from '../ui/components';
import type { ParsedRoute } from '../core/router';
import { importFile } from '../features/exportImport';
import { applyTheme } from '../features/settings';
import { renderNav, renderStatus } from '../ui/nav';
import { toast } from '../ui/toast';
import { providerHealth } from '../providers/registry';
import {
  isConfigured,
  currentAuth,
  onAuthChange,
  signInGoogle,
  signInEmail,
  signOut,
  onSyncStatus,
  syncStatus,
  flush,
  migrateGuestToAccount,
  deleteAllAccountData,
  type SyncStatus,
  type AuthState
} from '../sync';

const host = () => document.getElementById('view') as HTMLElement;

function row(act: string, icon: string, title: string, sub: string, extra = ''): string {
  return (
    '<button class="kv" style="width:100%;text-align:left;gap:12px;border:0;background:none;padding:12px 4px;cursor:pointer" data-act="' + act + '"' + extra + '>' +
    '<span style="width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.05);color:var(--acc);flex:none">' + svg(icon, '', 2) + '</span>' +
    '<span style="flex:1;min-width:0"><b style="display:block;font-size:13.6px">' + title + '</b>' +
    '<span style="font-size:11.8px;color:var(--mut)">' + sub + '</span></span>' +
    svg('right', '', 2.2) + '</button>'
  );
}

function syncDot(st: SyncStatus): string {
  if (!st.configured) return '<span class="dot" title="Belum dikonfigurasi"></span>';
  if (!st.signedIn) return '<span class="dot" title="Tamu"></span>';
  if (st.state === 'syncing') return '<span class="dot on" title="Menyinkronkan"></span>';
  if (st.state === 'error') return '<span class="dot off" title="' + esc(st.lastError || 'Gagal') + '"></span>';
  if (st.state === 'offline') return '<span class="dot off" title="Offline"></span>';
  return '<span class="dot on" title="Tersinkron"></span>';
}

function syncLabel(st: SyncStatus): string {
  if (!st.configured) return 'Belum dikonfigurasi';
  if (!st.signedIn) return 'Mode tamu · data lokal';
  if (st.state === 'syncing') return 'Menyinkronkan…';
  if (st.state === 'error') return 'Gagal: ' + (st.lastError || 'tidak diketahui');
  if (st.state === 'offline') return 'Offline · menunggu jaringan';
  if (st.lastSyncAt) return 'Tersinkron · ' + new Date(st.lastSyncAt).toLocaleString('id-ID');
  return 'Siap sinkron';
}

function accountSectionHTML(auth: AuthState, st: SyncStatus): string {
  if (!st.configured) {
    return (
      '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('user', '', 2) + ' Akun & Sinkronisasi</h3>' +
      '<p style="font-size:12.8px;color:var(--mut);line-height:1.65;margin:2px 0 10px">' +
      'Sinkronisasi antar-perangkat memerlukan konfigurasi Supabase. Setel <b style="color:var(--txt)">VITE_SUPABASE_URL</b> dan ' +
      '<b style="color:var(--txt)">VITE_SUPABASE_PUBLISHABLE_KEY</b> di berkas <b style="color:var(--txt)">.env</b> lalu build ulang. ' +
      'Sementara itu gunakan <b style="color:var(--txt)">Ekspor JSON</b> untuk memindahkan data.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-act="export-data">' + svg('download', '', 2) + ' Ekspor JSON</button>' +
      '<label class="btn ghost sm" style="cursor:pointer">' + svg('up', '', 2) + ' Impor JSON' +
      '<input type="file" accept="application/json,.json" style="display:none" data-act="import-file-profile"></label>' +
      '</div></section>'
    );
  }

  if (!auth.signedIn) {
    return (
      '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('user', '', 2) + ' Akun & Sinkronisasi</h3>' +
      '<p style="font-size:12.8px;color:var(--mut);line-height:1.65;margin:2px 0 10px">' +
      'Kamu berjalankan <b style="color:var(--txt)">mode tamu</b>. Masuk akun untuk menyinkronkan favorit, riwayat, dan progres ' +
      'antar-perangkat. Data tamu tidak akan dihapus — akan digabung (last-write-wins) setelah masuk.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button class="btn primary sm" data-act="signin-google" style="gap:8px">' + googleLogoSVG(16) + ' Masuk dengan Google</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<input class="txtin" type="email" placeholder="email@contoh.com" data-act="signin-email-input" style="flex:1;min-width:0;height:34px">' +
      '<button class="btn ghost sm" data-act="signin-email">Kirim tautan</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn ghost sm" data-act="export-data">' + svg('download', '', 2) + ' Ekspor JSON</button>' +
      '<label class="btn ghost sm" style="cursor:pointer">' + svg('up', '', 2) + ' Impor JSON' +
      '<input type="file" accept="application/json,.json" style="display:none" data-act="import-file-profile"></label>' +
      '</div></section>'
    );
  }

  const u = auth.user!;
  const hasLocalData = Store.favs.length + Store.hist.length + Store.cont.length > 0;
  return (
    '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('user', '', 2) + ' Akun & Sinkronisasi</h3>' +
    '<div style="display:flex;gap:12px;align-items:center;margin:6px 0 12px">' +
    (u.avatar
      ? '<img src="' + esc(u.avatar) + '" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none">'
      : '<span style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.06);color:var(--acc);flex:none">' + svg('user', '', 2) + '</span>') +
    '<span style="flex:1;min-width:0"><b style="display:block;font-size:14px">' + esc(u.name || u.email || 'Pengguna') + '</b>' +
    '<span style="font-size:11.8px;color:var(--mut)">' + esc(u.email || u.id.slice(0, 8)) + '</span></span>' +
    '</div>' +
    '<div class="kv"><span style="display:flex;gap:8px;align-items:center">' + syncDot(st) + ' Status sinkronisasi</span>' +
    '<b style="font-size:12px;color:' + (st.state === 'error' ? 'var(--err,#f66)' : 'var(--txt)') + '">' + esc(syncLabel(st)) + '</b></div>' +
    (st.pending ? '<div class="kv"><span>Antrean belum terkirim</span><b>' + st.pending + ' perubahan</b></div>' : '') +
    (hasLocalData
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button class="btn ghost sm" data-act="sync-now">' + svg('refresh', '', 2) + ' Sinkronkan sekarang</button>' +
        '<button class="btn ghost sm" data-act="migrate-guest">' + svg('bolt', '', 2) + ' Gabungkan data tamu</button>' +
        '</div>'
      : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="btn ghost sm" data-act="export-data">' + svg('download', '', 2) + ' Ekspor JSON</button>' +
    '<label class="btn ghost sm" style="cursor:pointer">' + svg('up', '', 2) + ' Impor JSON' +
    '<input type="file" accept="application/json,.json" style="display:none" data-act="import-file-profile"></label>' +
    '<button class="btn danger sm" data-act="delete-account-data">' + svg('trash', '', 2) + ' Hapus data akun</button>' +
    '<button class="btn danger sm" data-act="signout">' + svg('x', '', 2) + ' Keluar</button>' +
    '</div></section>'
  );
}

function providerRows(): string {
  const cur = Store.getProvider();
  return Object.keys(PROVIDERS)
    .sort((a, b) => PROVIDERS[a].priority - PROVIDERS[b].priority)
    .map(id => {
      const p = PROVIDERS[id];
      const hp = providerHealth(id);
      const dot = hp ? (hp.ok ? 'on' : 'off') : '';
      const dotTitle = hp ? (hp.ok ? 'Respons terakhir berhasil' : hp.message || 'Respons terakhir gagal') : 'Belum diuji sesi ini';
      return (
        '<div class="kv" style="gap:10px">' +
        '<span class="dot ' + dot + '" title="' + esc(dotTitle) + '" style="flex:none"></span>' +
        '<span style="flex:1;min-width:0"><b style="display:block;font-size:13.2px">' + esc(p.name) +
        (id === cur ? ' <span style="font-size:10px;color:var(--acc);font-weight:700">· AKTIF</span>' : '') + '</b>' +
        '<span style="font-size:11.6px;color:var(--mut);line-height:1.5">' + esc(p.desc) + '</span></span>' +
        '</div>'
      );
    })
    .join('');
}

let unsubAuth: (() => void) | null = null;
let unsubSync: (() => void) | null = null;

export async function ViewProfile(_r?: ParsedRoute): Promise<void> {
  const auth = currentAuth();
  const st = syncStatus();

  host().innerHTML =
    '<div class="shell" style="padding-top:22px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Profil</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">' +
    (auth.signedIn ? 'Masuk sebagai ' + esc(auth.user?.name || auth.user?.email || '') : 'Mode tamu') +
    ' · preferensi dan koleksi tersimpan di perangkat ini</p></div>' +

    accountSectionHTML(auth, st) +

    '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('settings', '', 2) + ' Menu</h3>' +
    '<div style="margin-top:6px">' +
    row('open-settings', 'settings', 'Pengaturan', 'Provider, pemutaran, tema, notifikasi, cadangan') +
    '<a class="kv" style="width:100%;text-align:left;gap:12px;border:0;background:none;padding:12px 4px;cursor:pointer;text-decoration:none;color:inherit" href="#/schedule">' +
    '<span style="width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.05);color:var(--acc);flex:none">' + svg('cal', '', 2) + '</span>' +
    '<span style="flex:1;min-width:0"><b style="display:block;font-size:13.6px">Jadwal Rilis</b>' +
    '<span style="font-size:11.8px;color:var(--mut)">Episode baru per hari</span></span>' + svg('right', '', 2.2) + '</a>' +
    '<a class="kv" style="width:100%;text-align:left;gap:12px;border:0;background:none;padding:12px 4px;cursor:pointer;text-decoration:none;color:inherit" href="#/library?t=stats">' +
    '<span style="width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.05);color:var(--acc);flex:none">' + svg('chart', '', 2) + '</span>' +
    '<span style="flex:1;min-width:0"><b style="display:block;font-size:13.6px">Statistik Menonton</b>' +
    '<span style="font-size:11.8px;color:var(--mut)">Ringkasan aktivitas di tab Library</span></span>' + svg('right', '', 2.2) + '</a>' +
    row('clear-cache', 'refresh', 'Bersihkan Cache', 'Ambil ulang data provider dari awal') +
    row('reset-all', 'alert', 'Reset Semua Data', 'Hapus favorit, riwayat, progres, dan pengaturan') +
    '</div></section>' +

    '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('server', '', 2) + ' Status Provider</h3>' +
    '<p style="font-size:11.8px;color:var(--mut);margin:2px 0 8px;line-height:1.55">Titik hijau = respons terakhir berhasil, merah = gagal, kosong = belum diuji sesi ini. Kegagalan otomatis dialihkan ke provider berikutnya.</p>' +
    providerRows() +
    '</section>' +

    '<section class="panel rv"><h3>' + svg('info', '', 2) + ' Tentang</h3>' +
    '<p style="font-size:12.6px;color:var(--mut);line-height:1.65;margin:2px 0 8px">' +
    '<b style="color:var(--txt)">nanime</b> — klien streaming anime open-source berbasis web yang dibungkus aplikasi Android. ' +
    'Semua data diambil dari situs pihak ketiga secara langsung dari perangkat (client-side); kami tidak menyimpan atau ' +
    'mendistribusikan video apa pun. Dukung rilis resmi bila kamu menikmati sebuah judul.</p>' +
    '<div class="kv"><span>Versi aplikasi</span><b>2.0.0</b></div>' +
    '<div class="kv"><span>Mode</span><b>' + (auth.signedIn ? 'Akun tersinkron' : 'Client-side · Lokal') + '</b></div>' +
    '</section>' +

    footerHTML() + '</div>';

  initView(host());
  bindProfileActions();
  refreshAccount();

  // Perbarui bagian akun secara langsung bila status auth/sinkron berubah.
  unsubAuth?.();
  unsubSync?.();
  unsubAuth = onAuthChange(() => refreshAccount());
  unsubSync = onSyncStatus(() => refreshAccount());
}

function refreshAccount(): void {
  const sec = host().querySelector('.panel.rv');
  if (!sec) return;
  // Panel pertama setelah header adalah bagian akun.
  const panels = host().querySelectorAll<HTMLElement>('section.panel.rv');
  if (!panels.length) return;
  const auth = currentAuth();
  const st = syncStatus();
  const tmp = document.createElement('div');
  tmp.innerHTML = accountSectionHTML(auth, st);
  const fresh = tmp.firstElementChild;
  if (fresh) {
    panels[0].replaceWith(fresh as HTMLElement);
    initView(fresh as HTMLElement);
    bindAccountActions();
  }
  // Perbarui subjudul
  const sub = host().querySelector<HTMLElement>('.rv.in p');
  if (sub) {
    sub.textContent =
      (auth.signedIn ? 'Masuk sebagai ' + (auth.user?.name || auth.user?.email || '') : 'Mode tamu') +
      ' · preferensi dan koleksi tersimpan di perangkat ini';
  }
}

function bindAccountActions(): void {
  const root = host();
  root.querySelector('[data-act="signin-google"]')?.addEventListener('click', async () => {
    const btn = root.querySelector<HTMLButtonElement>('[data-act="signin-google"]');
    if (btn) btn.disabled = true;
    const res = await signInGoogle();
    if (res.url && res.ok) {
      // Web: biarkan redirect berjalan; native: buka di browser eksternal.
      const isNative = res.url.startsWith('nanime://') || (globalThis as any).Capacitor?.isNativePlatform?.();
      if (isNative) {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: res.url });
        } catch {
          location.href = res.url;
        }
      } else if (!location.href.startsWith(res.url)) {
        // Biarkan Supabase melakukan redirect (window.location sudah diatur client) —
        // bila tidak, buka manual.
        if (!res.url.startsWith('http')) location.href = res.url;
      }
      toast(res.message, 'info');
    } else {
      toast(res.message, 'err', 'Masuk gagal');
      if (btn) btn.disabled = false;
    }
  });

  root.querySelector('[data-act="signin-email"]')?.addEventListener('click', async () => {
    const inp = root.querySelector<HTMLInputElement>('[data-act="signin-email-input"]');
    const res = await signInEmail(inp?.value || '');
    toast(res.message, res.ok ? 'ok' : 'err', res.ok ? 'Periksa email' : 'Gagal');
  });

  root.querySelector('[data-act="sync-now"]')?.addEventListener('click', async () => {
    toast('Menyinkronkan…', 'info');
    const ok = await flush();
    toast(ok ? 'Sinkronisasi selesai.' : 'Sinkronisasi gagal. Coba lagi.', ok ? 'ok' : 'err');
    refreshAccount();
  });

  root.querySelector('[data-act="migrate-guest"]')?.addEventListener('click', async () => {
    if (!confirm('Gabungkan data tamu lokal ke akun? Data tidak akan dihapus bila gagal.')) return;
    const res = await migrateGuestToAccount();
    toast(res.message, res.ok ? 'ok' : 'err', res.ok ? 'Migrasi selesai' : 'Migrasi gagal');
    refreshAccount();
  });

  root.querySelector('[data-act="signout"]')?.addEventListener('click', async () => {
    const res = await signOut();
    toast(res.message, res.ok ? 'ok' : 'err');
    setTimeout(() => location.reload(), 500);
  });

  root.querySelector('[data-act="delete-account-data"]')?.addEventListener('click', async () => {
    if (!confirm('Hapus SEMUA data akun di server? Tindakan ini tidak dapat dibatalkan.')) return;
    if (!confirm('Yakin sekali lagi? Seluruh favorit, riwayat, & progres di server akan hilang.')) return;
    const res = await deleteAllAccountData();
    toast(res.message, res.ok ? 'ok' : 'err');
    refreshAccount();
  });
}

function bindProfileActions(): void {
  bindAccountActions();

  const inp = document.querySelector<HTMLInputElement>('input[data-act="import-file-profile"]');
  if (inp) {
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const res = await importFile(f);
      toast(res.message, res.ok ? 'ok' : 'err', res.ok ? 'Impor berhasil' : 'Impor gagal');
      if (res.ok) {
        applyTheme();
        renderNav();
        renderStatus();
        setTimeout(() => location.reload(), 700);
      }
    });
  }
}
