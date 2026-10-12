import { PROVIDERS } from '../core/config';
import { API } from '../core/api';
import { progress } from '../core/client';
import { Store } from '../core/store';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { cardHTML, dropRailArrows, footerHTML, railItems, secHead, skCards, stateHTML } from '../ui/components';
import type { ListResult } from '../core/types';
import type { ParsedRoute } from '../core/router';

const EX_COPY: Record<string, { a: string[]; b: string[] }> = {
  otakudesu: { a: ['Sedang Tayang', 'Anime ongoing dari Otakudesu'], b: ['Anime Selesai', 'Anime completed dari Otakudesu'] },
  oploverz: { a: ['Katalog Oploverz', 'Semua judul (A–Z) dari direktori Oploverz'], b: ['Rilis Terbaru', 'Episode terbaru dari Oploverz'] },
  kuramanime: { a: ['Sedang Tayang', 'Anime ongoing dari Kuramanime'], b: ['Anime Selesai', 'Anime completed dari Kuramanime'] }
};

const host = () => document.getElementById('view') as HTMLElement;

function renderList(hostId: string, res: ListResult, opt: { catalog?: boolean; sec: string; rail: string; wrap: string }): void {
  const el = document.getElementById(hostId);
  if (!el) return;
  const list = res.list || [];
  if (!list.length) {
    el.innerHTML = stateHTML('empty', 'Tidak ada data', 'Daftar ini tidak tersedia untuk provider ' + PROVIDERS[Store.getProvider()].name + ' saat ini.', '');
    dropRailArrows(opt.sec);
    return;
  }
  if (opt.catalog && list.length > 48) {
    const STEP = 48;
    let shown = 0;
    const grid = document.createElement('div');
    grid.className = 'grid wide';
    const more = document.createElement('div');
    more.style.cssText = 'display:flex;justify-content:center;margin-top:18px';
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    el.innerHTML = '';
    el.appendChild(grid);
    el.appendChild(more);
    more.appendChild(btn);
    dropRailArrows(opt.sec);
    const paint = () => {
      const part = list.slice(shown, shown + STEP);
      grid.insertAdjacentHTML(
        'beforeend',
        part.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * 30) + 'ms">' + cardHTML(a, { g: true }) + '</div>').join('')
      );
      shown += part.length;
      initView(grid);
      if (shown >= list.length) more.style.display = 'none';
      else btn.textContent = 'Muat lebih banyak (' + (list.length - shown) + ')';
    };
    btn.addEventListener('click', paint);
    paint();
    return;
  }
  el.innerHTML =
    '<div class="rail" data-railwrap="' + opt.wrap + '"><div class="rail-track" id="' + opt.rail + '">' +
    railItems(list) + '</div></div>';
  initView(el);
}

export async function ViewExplore(_r: ParsedRoute): Promise<void> {
  const provider = Store.getProvider();
  const cp = EX_COPY[provider] || EX_COPY.otakudesu;
  host().innerHTML =
    '<div class="shell" style="padding-top:18px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Jelajah</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">Temukan anime berdasarkan genre dan kategori · Provider <b>' +
      esc(PROVIDERS[provider].name) + '</b></p></div>' +
    '<section class="sec" id="expGenre"><div class="sk" style="height:34px;border-radius:99px;margin-bottom:8px"></div><div class="sk" style="height:34px;border-radius:99px;width:80%"></div></section>' +
    '<section class="sec" id="expOngoing">' + secHead(cp.a[0], cp.a[1], 'railExpOngoing') +
      '<div id="expOngoingBody"><div class="rail" data-railwrap="we1"><div class="rail-track" id="railExpOngoing">' + skCards(10) + '</div></div></div></section>' +
    '<section class="sec" id="expCompleted">' + secHead(cp.b[0], cp.b[1], 'railExpCompleted') +
      '<div id="expCompletedBody"><div class="rail" data-railwrap="we2"><div class="rail-track" id="railExpCompleted">' + skCards(10) + '</div></div></div></section>' +
    '<section class="sec" id="expBatch">' + secHead('Anime Acak', 'Pilih judul tanpa mikir', 'railBatch') +
      '<div id="expBatchBody"><div class="rail" data-railwrap="we3"><div class="rail-track" id="railBatch">' + skCards(10) + '</div></div></div></section>' +
    footerHTML() + '</div>';

  try {
    progress(true, 20);
    const [genres, ongoing, completed] = await Promise.all([API.genres(), API.ongoing(1), API.completed(1)]);
    progress(true, 100);
    setTimeout(() => progress(false), 300);

    if (genres.length) {
      const g = document.getElementById('expGenre');
      if (g) {
        g.innerHTML =
          secHead('Genre', 'Pilih genre untuk melihat katalog') +
          '<div class="filters" style="flex-wrap:wrap;padding:2px">' +
          genres.map(x => '<a class="chip" href="#/genre/' + encodeURIComponent(x.genreId) + '?title=' + encodeURIComponent(x.title) + '">' + esc(x.title) + '</a>').join('') +
          '</div>';
      }
    }

    renderList('expOngoingBody', ongoing, { catalog: !!ongoing.catalog, sec: '#expOngoing', rail: 'railExpOngoing', wrap: 'we1' });
    renderList('expCompletedBody', completed, { catalog: false, sec: '#expCompleted', rail: 'railExpCompleted', wrap: 'we2' });

    const pool = [...ongoing.list, ...completed.list];
    const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, 14);
    const batchBody = document.getElementById('expBatchBody');
    if (batchBody) {
      if (shuffled.length) {
        batchBody.innerHTML =
          '<div class="rail" data-railwrap="we3"><div class="rail-track" id="railBatch">' +
          railItems(shuffled) + '</div></div>';
        dropRailArrows('#expBatch');
        initView(batchBody);
      } else {
        document.getElementById('expBatch')?.remove();
      }
    }

    initView(host());
  } catch (e: any) {
    progress(false);
    const g = document.getElementById('expGenre');
    if (g) {
      g.innerHTML = stateHTML(
        'err',
        'Gagal memuat',
        e?.message || '',
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Coba lagi</button>'
      );
    }
  }
}
