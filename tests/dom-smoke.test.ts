// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

const SHELL = `
<div id="bg"><div class="orb a"></div><div class="orb b"></div></div>
<div class="topgrad" id="topgrad"></div>
<div id="app">
<aside id="sidebar">
<a class="sb-brand" href="#/home"><span class="lbox"><img src="logo.jpg" alt="Logo" width="44" height="44"></span></a>
<nav class="sb-nav" id="sbNav"></nav>
<div class="sb-foot">
<div class="sb-status" id="sbStatus"></div>
<button class="btn ghost sm" data-act="open-settings" id="btnSettings">Pengaturan</button>
</div>
</aside>
<header id="topbar">
<button class="ibtn" id="tbBack" data-act="back" style="display:none"></button>
<a class="tb-logo" href="#/home" id="tbBrand"><img src="logo.jpg" alt="" width="28" height="28"><span>NANIME</span></a>
<span class="spacer"></span><span id="tbStatus"></span>
<button class="ibtn" data-act="open-palette" id="btnPalette"></button>
</header>
<main id="view" role="main"></main>
<nav id="tabbar"></nav>
</div>
<div id="toasts" aria-live="polite"></div>
<div id="sheet-root" role="dialog" aria-modal="true"></div>
`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(() => {
  document.body.innerHTML = SHELL;
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline test')));
});

describe('smoke test DOM', () => {
  it('boot merender beranda & navigasi', async () => {
    await import('../src/main');
    await sleep(120);
    const view = document.getElementById('view')!;
    expect(view.innerHTML).toContain('NANIME');
    expect(view.innerHTML).toContain('hero');
    expect(document.getElementById('tabbar')!.children.length).toBeGreaterThan(3);
    expect(document.getElementById('sbNav')!.children.length).toBeGreaterThan(3);
    expect(document.getElementById('sbStatus')!.textContent).toContain('Otomatis');
  });

  it('menampilkan state gagal saat API tidak terjangkau', async () => {
    await sleep(300);
    const view = document.getElementById('view')!;
    expect(view.innerHTML.toLowerCase()).toContain('gagal');
  });

  it('rute favorit, riwayat, statistik & jadwal render', async () => {
    const app = await import('../src/app');

    location.hash = '#/favorite';
    await app.render();
    await sleep(40);
    expect(document.getElementById('view')!.innerHTML).toContain('Favorite');

    location.hash = '#/history';
    await app.render();
    await sleep(40);
    expect(document.getElementById('view')!.innerHTML).toContain('Riwayat');

    location.hash = '#/stats';
    await app.render();
    await sleep(40);
    expect(document.getElementById('view')!.innerHTML).toContain('Statistik');

    location.hash = '#/schedule';
    await app.render();
    await sleep(400);
    expect(document.getElementById('view')!.innerHTML).toContain('Jadwal Rilis');
  });

  it('tombol pengaturan membuka bottom sheet', async () => {
    (document.getElementById('btnSettings') as HTMLElement).click();
    await sleep(40);
    const root = document.getElementById('sheet-root')!;
    expect(root.classList.contains('open')).toBe(true);
    expect(root.textContent).toContain('Pengaturan');
    expect(root.textContent).toContain('Sumber Otomatis');
    expect(root.textContent).toContain('Hemat data');
  });

  it('palette perintah terbuka lewat tombol', async () => {
    (document.getElementById('btnPalette') as HTMLElement).click();
    await sleep(60);
    const root = document.getElementById('sheet-root')!;
    expect(root.textContent).toContain('Perintah Cepat');
    const items = root.querySelectorAll('.pal-item');
    expect(items.length).toBeGreaterThan(5);
  });
});
