import { API } from '../core/api';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { cardHTML, footerHTML, skCards, stateHTML } from '../ui/components';
import { toast } from '../ui/toast';
import type { ParsedRoute } from '../core/router';

const host = () => document.getElementById('view') as HTMLElement;

export async function ViewGenre(r: ParsedRoute): Promise<void> {
  const genreId = r.parts[1] || '';
  const title = r.q.title || genreId;
  let currentPage = 1;
  let hasNextPage = true;

  host().innerHTML =
    '<div class="shell" style="padding-top:18px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">' + esc(title) + '</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">Katalog genre dari Otakudesu</p></div>' +
    '<div id="genreGrid" class="grid wide">' + skCards(12, true) + '</div>' +
    '<div id="genreLoadWrap" style="display:flex;justify-content:center;margin-top:22px"><button class="btn ghost" id="genreLoad">Muat lebih banyak</button></div>' +
    footerHTML() + '</div>';

  async function loadPage(page: number, append = false): Promise<void> {
    const result = await API.genre(genreId, page);
    currentPage = page;
    hasNextPage = !!result.pagination?.hasNextPage;
    const grid = document.getElementById('genreGrid') as HTMLElement;
    const html = result.list.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * 40) + 'ms">' + cardHTML(a, { g: true }) + '</div>').join('');
    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html;
    initView(grid);
    const wrap = document.getElementById('genreLoadWrap') as HTMLElement;
    wrap.style.display = hasNextPage ? 'flex' : 'none';
  }

  try {
    await loadPage(1, false);
    const btn = document.getElementById('genreLoad') as HTMLButtonElement;
    btn.onclick = async () => {
      if (!hasNextPage) return;
      btn.disabled = true;
      btn.textContent = 'Memuat…';
      try {
        await loadPage(currentPage + 1, true);
      } catch (e: any) {
        toast(e?.message || 'Gagal memuat', 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Muat lebih banyak';
      }
    };
  } catch (e: any) {
    const grid = document.getElementById('genreGrid') as HTMLElement;
    grid.innerHTML =
      '<div style="grid-column:1/-1">' + stateHTML(
        'err',
        'Gagal memuat genre',
        e?.message || '',
        '<button class="btn primary" data-act="reload">Coba lagi</button>'
      ) + '</div>';
    const wrap = document.getElementById('genreLoadWrap') as HTMLElement;
    if (wrap) wrap.style.display = 'none';
  }
}
