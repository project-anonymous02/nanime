import { PROVIDERS } from '../core/config';
import { Store, DEFAULT_CFG, storageSize } from '../core/store';
import { clearCache, cacheStats } from '../core/client';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { openSheet, updateSheetBody } from '../ui/sheet';
import { toast } from '../ui/toast';
import { renderNav, renderStatus } from '../ui/nav';
import { exportData, importFile } from './exportImport';
import { syncNotifySetting } from './notify';

function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

const ACCENTS = ['#3E7BFA', '#8B5CF6', '#22C55E', '#F5A524', '#FF4D6D', '#06B6D4'];

function hexRgb(hex: string): [number, number, number] {
  const h = String(hex || '').replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(s || '3E7BFA', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex);
  const f = (c: number) => Math.round(c + (255 - c) * amt);
  return '#' + [f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

export function applyTheme(): void {
  const cfg = Store.cfg;
  const sysLight = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  const theme = cfg.theme === 'system' ? (sysLight ? 'light' : 'dark') : cfg.theme;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-saver', cfg.dataSaver ? '1' : '0');
  const accent = cfg.accent || DEFAULT_CFG.accent;
  root.style.setProperty('--acc', accent);
  root.style.setProperty('--acc2', lighten(accent, 0.35));
  root.style.setProperty('--acc-soft', rgba(accent, 0.14));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F5F7FB' : '#05060A');
}

export function settingsHTML(): string {
  let h = '';

  h += '<div class="set-grp"><h4>Provider Utama</h4>';
  Object.entries(PROVIDERS)
    .filter(([, p]) => !p.kind)
    .forEach(([id, p]) => {
      const active = Store.getProvider() === id;
      h +=
        '<div class="adp ' + (p.active ? 'live' : 'dead') + '">' +
        '<div class="top"><span class="dot ' + (p.active ? 'on' : 'off') + '"></span><b>' + esc(p.name) + '</b>' +
        '<span style="font-size:11px;color:var(--dim)">' + (p.active ? (active ? '● Aktif' : 'Tersedia') : 'OFF') + '</span>' +
        (p.active ? '<button class="sw' + (active ? ' on' : '') + '" data-act="set-provider" data-id="' + id + '" role="switch" aria-pressed="' + active + '"><i></i></button>' : '') +
        '</div><p class="desc">' + esc(p.desc) + '</p></div>';
    });
  const movieSrcs = Object.entries(PROVIDERS).filter(([, p]) => p.kind);
  if (movieSrcs.length) {
    h += '<div class="set-grp" style="margin-top:16px"><h4>Sumber Movie</h4>';
    movieSrcs.forEach(([id, p]) => {
      h +=
        '<div class="adp ' + (p.active ? 'live' : 'dead') + '"><div class="top"><span class="dot ' + (p.active ? 'on' : 'off') + '"></span>' +
        '<b>' + esc(p.name) + '</b><span style="font-size:11px;color:var(--dim)">' + (p.active ? 'Aktif' : 'OFF') + '</span></div>' +
        '<p class="desc">' + esc(p.desc) + '</p></div>';
    });
    h += '</div>';
  }
  h += '</div>';

  h +=
    '<div class="set-grp"><h4>Pemutaran</h4>' +
    '<div class="kv"><span>Auto-next episode</span><button class="sw' + (Store.cfg.autoNext ? ' on' : '') + '" data-act="toggle" data-k="autoNext" role="switch" aria-pressed="' + !!Store.cfg.autoNext + '"><i></i></button></div>' +
    '<div class="kv"><span>Putar otomatis</span><button class="sw' + (Store.cfg.autoplay ? ' on' : '') + '" data-act="toggle" data-k="autoplay" role="switch" aria-pressed="' + !!Store.cfg.autoplay + '"><i></i></button></div>' +
    '<div class="kv"><span>Simpan riwayat & progres</span><button class="sw' + (Store.cfg.keepHistory ? ' on' : '') + '" data-act="toggle" data-k="keepHistory" role="switch" aria-pressed="' + !!Store.cfg.keepHistory + '"><i></i></button></div>' +
    '<div class="kv"><span>Kualitas favorit</span><select class="txtin" style="width:auto;height:32px" data-act="set-quality">' +
    ['', '360p', '480p', '720p', '1080p']
      .map(q => '<option value="' + q + '"' + (Store.cfg.defaultQuality === q ? ' selected' : '') + '>' + (q || 'Ikuti server') + '</option>')
      .join('') +
    '</select></div>' +
    '</div>';

  h +=
    '<div class="set-grp"><h4>Tampilan</h4>' +
    '<div class="seg" style="margin-bottom:12px">' +
    (['dark', 'light', 'system'] as const)
      .map(t => '<button class="' + (Store.cfg.theme === t ? 'on' : '') + '" data-act="set-theme" data-v="' + t + '">' + ({ dark: 'Gelap', light: 'Terang', system: 'Sistem' } as const)[t] + '</button>')
      .join('') +
    '</div>' +
    '<div class="swatches">' +
    ACCENTS.map(c => '<button class="swatch' + (Store.cfg.accent === c ? ' on' : '') + '" data-act="set-accent" data-v="' + c + '" style="background:' + c + '" aria-label="Warna ' + c + '"></button>').join('') +
    '</div>' +
    '<div class="kv" style="margin-top:12px"><span>Hemat data (nonaktifkan efek & video beranda)</span><button class="sw' + (Store.cfg.dataSaver ? ' on' : '') + '" data-act="toggle" data-k="dataSaver" role="switch" aria-pressed="' + !!Store.cfg.dataSaver + '"><i></i></button></div>' +
    '</div>';

  h +=
    '<div class="set-grp"><h4>Notifikasi Episode Baru</h4>' +
    '<div class="kv"><span>Cek episode baru</span><button class="sw' + (Store.cfg.notify ? ' on' : '') + '" data-act="toggle-notify" role="switch" aria-pressed="' + !!Store.cfg.notify + '"><i></i></button></div>' +
    '<div class="kv"><span>Interval pengecekan</span><select class="txtin" style="width:auto;height:32px" data-act="set-interval">' +
    [5, 15, 30, 60]
      .map(n => '<option value="' + n + '"' + (Store.cfg.notifyInterval === n ? ' selected' : '') + '>' + n + ' menit</option>')
      .join('') +
    '</select></div></div>';

  const cs = cacheStats();
  h +=
    '<div class="set-grp"><h4>Status Provider</h4>' +
    '<div class="note">APK: HTTP native via CapacitorHttp (bypass CORS). Browser: CORS diblokir — pasang APK untuk akses penuh.</div>' +
    '<div class="kv" style="margin-top:12px"><span>Cache respons</span><span>' + cs.entries + ' entri · ' + fmtBytes(cs.bytes) + '</span></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="btn ghost sm" data-act="clear-cache">' + svg('refresh', '', 2) + ' Bersihkan cache</button>' +
    '</div></div>';

  h +=
    '<div class="set-grp"><h4>Data</h4>' +
    '<div class="kv"><span>Favorit</span><span>' + Store.favs.length + ' anime</span></div>' +
    '<div class="kv"><span>Riwayat</span><span>' + Store.hist.length + ' anime · ' + Store.cont.length + ' lanjut</span></div>' +
    '<div class="kv"><span>Ukuran terpakai</span><span>' + fmtBytes(storageSize()) + '</span></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
    '<button class="btn ghost sm" data-act="export-data">' + svg('download', '', 2) + ' Ekspor JSON</button>' +
    '<label class="btn ghost sm" style="cursor:pointer">' + svg('up', '', 2) + ' Impor JSON<input type="file" accept="application/json,.json" style="display:none" data-act="import-file"></label>' +
    '<button class="btn danger sm" data-act="clear-favs">' + svg('trash', '', 2) + ' Hapus Favorit</button>' +
    '<button class="btn danger sm" data-act="clear-hist">' + svg('trash', '', 2) + ' Hapus Riwayat</button>' +
    '<button class="btn danger sm" data-act="reset-all">' + svg('alert', '', 2) + ' Reset Semua</button>' +
    '</div></div>';

  h +=
    '<div class="set-grp"><h4>Tentang</h4>' +
    '<div class="note"><b>Nanime v' + '2.0' + '</b> — streaming anime subtitle Indonesia sepenuhnya di sisi klien tanpa backend milik sendiri. Provider aktif: <b>' +
    esc(PROVIDERS[Store.getProvider()].name) + '</b>.</div>' +
    '</div>';

  return h;
}

export function openSettings(): void {
  openSheet('Pengaturan', settingsHTML());
  bindFileInput();
}

export function refreshSettings(): void {
  updateSheetBody(settingsHTML());
  bindFileInput();
}

function bindFileInput(): void {
  const fileInp = document.querySelector<HTMLInputElement>('input[data-act="import-file"]');
  if (fileInp) {
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) return;
      const res = await importFile(f);
      toast(res.message, res.ok ? 'ok' : 'err', res.ok ? 'Impor berhasil' : 'Impor gagal');
      if (res.ok) {
        applyTheme();
        renderNav();
        renderStatus();
        refreshSettings();
        setTimeout(() => location.reload(), 700);
      }
    });
  }
}

export const SettingsActions = {
  setProvider(id: string) {
    if (!PROVIDERS[id] || !PROVIDERS[id].active) return;
    Store.setCfg('provider', id);
    toast('Provider diubah ke ' + PROVIDERS[id].name, 'ok');
    renderNav();
    renderStatus();
    refreshSettings();
    setTimeout(() => location.reload(), 500);
  },
  toggle(key: 'autoNext' | 'autoplay' | 'dataSaver' | 'keepHistory') {
    Store.setCfg(key, !Store.cfg[key] as any);
    applyTheme();
    refreshSettings();
  },
  toggleNotify() {
    Store.setCfg('notify', !Store.cfg.notify);
    syncNotifySetting();
    refreshSettings();
  },
  setTheme(v: string) {
    const t = v === 'light' || v === 'system' ? v : 'dark';
    Store.setCfg('theme', t);
    applyTheme();
    refreshSettings();
  },
  setAccent(v: string) {
    Store.setCfg('accent', v);
    applyTheme();
    refreshSettings();
  },
  setQuality(v: string) {
    Store.setCfg('defaultQuality', v);
    toast(v ? 'Kualitas favorit: ' + v : 'Kualitas mengikuti server.', 'ok');
  },
  setInterval(v: string) {
    const n = parseInt(v, 10) || 15;
    Store.setCfg('notifyInterval', n);
    syncNotifySetting();
    toast('Interval notifikasi: ' + n + ' menit.', 'ok');
  },
  clearCache() {
    clearCache();
    toast('Cache respons dibersihkan.', 'ok');
    refreshSettings();
  },
  exportData,
  resetAll() {
    if (!confirm('Hapus SEMUA data (favorit, riwayat, progres, pengaturan)?')) return;
    Store.clearAll();
    localStorage.setItem('nanime.v2.cfg', JSON.stringify(DEFAULT_CFG));
    Object.assign(Store.cfg, DEFAULT_CFG);
    applyTheme();
    toast('Semua data direset.', 'ok');
    setTimeout(() => location.reload(), 600);
  }
};
