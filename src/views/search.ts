import { API } from '../core/api';
import { Store } from '../core/store';
import { debounce, esc } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { cardHTML, footerHTML, skCards, stateHTML } from '../ui/components';
import { toast } from '../ui/toast';
import { detailHref, type ParsedRoute } from '../core/router';
import type { Card, SearchResult } from '../core/types';

let searchSeq = 0;
let lastRes: SearchResult | null = null;
let lastQuery = '';
let sortMode: 'rel' | 'az' | 'score' = 'rel';
let typeFilter = 'all';

const host = () => document.getElementById('view') as HTMLElement;

function syncQueryUrl(q: string): void {
  try {
    history.replaceState(null, '', q ? '#/search?q=' + encodeURIComponent(q) : '#/search');
  } catch { /* noop */ }
}

function idleSearchState(): void {
  const box = document.getElementById('results');
  if (!box) return;
  box.innerHTML =
    '<div class="state rv in"><div class="ic">' + svg('search', '', 1.7) + '</div><h3>Mulai Mencari</h3>' +
    '<p>Ketik minimal 2 karakter. Pencarian berjalan di semua provider sekaligus.</p></div>';
  const ri = document.getElementById('resInfo');
  if (ri) ri.textContent = 'Ketik minimal 2 karakter untuk mencari';
}

function paintQHist(): void {
  const box = document.getElementById('qhist');
  if (!box) return;
  const list = Store.shist || [];
  box.innerHTML = list.length
    ? '<span class="lb">Terakhir</span>' +
      list.map(q => '<button class="chip" data-act="use-q" data-q="' + esc(q) + '">' + svg('clock', '', 2) + esc(q) + '</button>').join('') +
      '<button class="chip" data-act="clear-shist">' + svg('trash', '', 2) + ' Hapus</button>'
    : '';
  box.style.display = list.length ? '' : 'none';
}

function paintFilterRow(): void {
  const row = document.getElementById('sfRow');
  if (!row) return;
  row.innerHTML =
    '<button class="chip' + (sortMode === 'rel' ? ' on' : '') + '" data-act="ss" data-v="rel">Urut: Relevan</button>' +
    '<button class="chip' + (sortMode === 'az' ? ' on' : '') + '" data-act="ss" data-v="az">A–Z</button>' +
    '<button class="chip' + (sortMode === 'score' ? ' on' : '') + '" data-act="ss" data-v="score">Rating</button>' +
    '<span style="width:1px;height:22px;background:var(--line);margin:0 3px;flex:none"></span>' +
    '<button class="chip' + (typeFilter === 'all' ? ' on' : '') + '" data-act="st" data-v="all">Semua Tipe</button>' +
    '<button class="chip' + (typeFilter === 'movie' ? ' on' : '') + '" data-act="st" data-v="movie">Film</button>' +
    '<button class="chip' + (typeFilter === 'series' ? ' on' : '') + '" data-act="st" data-v="series">Serial</button>';
}

function visibleItems(): Card[] {
  if (!lastRes) return [];
  let items = lastRes.items;
  if (typeFilter === 'movie') items = items.filter(a => /movie|film/i.test(a.type || '') || a.provider === 'kusonime');
  if (typeFilter === 'series') items = items.filter(a => !/movie|film/i.test(a.type || '') && a.provider !== 'kusonime');
  if (sortMode === 'az') items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  if (sortMode === 'score') {
    items = [...items].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
  }
  return items;
}

function paintSearch(): void {
  const box = document.getElementById('results');
  const ri = document.getElementById('resInfo');
  if (!box || !lastRes) return;
  paintFilterRow();

  const items = visibleItems();
  const srcCount = (lastRes.sources || []).filter(s => s.ok).length;

  if (!items.length) {
    if (ri) ri.innerHTML = '0 hasil untuk <b style="color:var(--acc2)">' + esc(lastQuery) + '</b>';
    box.innerHTML = stateHTML(
      'search',
      'Tidak Ditemukan',
      'Tidak ada anime yang cocok dengan "' + lastQuery + '". Coba kata kunci lain.',
      '<button class="btn primary" data-act="retry-search">' + svg('refresh', '', 2.1) + ' Coba lagi</button>'
    );
    return;
  }

  if (ri) {
    ri.innerHTML =
      '<b style="color:var(--txt)">' + items.length + '</b> hasil untuk <b style="color:var(--acc2)">' +
      esc(lastQuery) + '</b>' + (srcCount ? '<span class="src"> · dari ' + srcCount + ' sumber</span>' : '') +
      (lastRes.items.length !== items.length ? ' · difilter' : '');
  }
  box.innerHTML =
    '<div style="display:flex;justify-content:flex-end;margin:2px 0 8px"><button class="btn ghost sm" data-act="random-result">' +
    svg('dice', '', 2) + ' Acak hasil</button></div>' +
    '<div class="grid wide">' +
    items.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms">' + cardHTML(a, { g: true }) + '</div>').join('') +
    '</div>';
  initView(box);
}

export async function runSearch(query: string): Promise<void> {
  const seq = ++searchSeq;
  lastQuery = query;
  syncQueryUrl(query);
  const box = document.getElementById('results');
  if (!box) return;
  box.innerHTML = '<div class="grid wide">' + skCards(12, true) + '</div>';
  const ri = document.getElementById('resInfo');
  if (ri) ri.innerHTML = 'Mencari <b style="color:var(--acc2)">' + esc(query) + '</b>…';
  try {
    const res = await API.search(query);
    if (seq !== searchSeq) return;
    lastRes = res;
    paintSearch();
  } catch (e: any) {
    if (seq !== searchSeq) return;
    lastRes = null;
    if (ri) ri.innerHTML = 'Gagal mencari <b style="color:var(--acc2)">' + esc(query) + '</b>';
    box.innerHTML = stateHTML(
      'err',
      'Pencarian Gagal',
      e?.message || 'Terjadi kesalahan saat mencari. Coba lagi.',
      '<button class="btn primary" data-act="retry-search">' + svg('refresh', '', 2.1) + ' Coba lagi</button>'
    );
  }
}

function randomResult(): void {
  const items = visibleItems();
  if (!items.length) {
    toast('Tidak ada hasil untuk diacak.', 'err');
    return;
  }
  const a = items[Math.floor(Math.random() * items.length)];
  location.hash = detailHref(a.id, a.provider, a.slug, a.title);
}

export async function ViewSearch(r: ParsedRoute): Promise<void> {
  const term = r.q.q || r.parts[1] || '';
  sortMode = 'rel';
  typeFilter = 'all';
  lastRes = null;
  lastQuery = term;
  syncQueryUrl(term);

  host().innerHTML =
    '<div class="shell" style="padding-top:6px">' +
    '<div class="sbar-wrap">' +
    '<div class="searchbar" id="sbar">' +
    '<span class="sic">' + svg('search', '', 2) + '</span>' +
    '<input id="sinput" type="search" autocomplete="off" spellcheck="false" placeholder="Cari judul anime (English/Japanese)…" value="' + esc(term) + '" aria-label="Cari anime">' +
    '<button class="clr" data-act="s-clear" aria-label="Hapus">' + svg('x', '', 2.4) + '</button>' +
    '</div>' +
    '<div class="filters sfil" id="sfRow"></div>' +
    '</div>' +
    '<div id="resInfo"></div>' +
    '<div id="qhist" class="qhist" style="margin-bottom:4px"></div>' +
    '<div id="results"></div>' +
    footerHTML() + '</div>';

  const inp = document.getElementById('sinput') as HTMLInputElement;
  const bar = document.getElementById('sbar') as HTMLElement;
  const sync = () => bar.classList.toggle('has', !!inp.value);
  sync();
  paintFilterRow();
  paintQHist();

  if (term) runSearch(term);
  else idleSearchState();

  inp.addEventListener(
    'input',
    debounce(() => {
      sync();
      const v = inp.value.trim();
      if (v.length >= 2) runSearch(v);
      else {
        searchSeq++;
        syncQueryUrl('');
        lastRes = null;
        lastQuery = '';
        idleSearchState();
        paintQHist();
      }
    }, 350)
  );

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = inp.value.trim();
      if (v.length >= 2) {
        Store.addQ(v);
        runSearch(v);
      }
    }
  });

  const clr = bar.querySelector('.clr');
  if (clr) {
    clr.addEventListener('click', () => {
      inp.value = '';
      sync();
      searchSeq++;
      syncQueryUrl('');
      lastRes = null;
      lastQuery = '';
      idleSearchState();
      paintQHist();
      inp.focus();
    });
  }

  if (!term) setTimeout(() => inp.focus(), 150);
}

export const SearchActions = {
  retry() {
    if (lastQuery) runSearch(lastQuery);
  },
  setSort(v: string) {
    const m = (v === 'az' || v === 'score' ? v : 'rel') as 'rel' | 'az' | 'score';
    if (m !== sortMode) {
      sortMode = m;
      paintSearch();
    }
  },
  setType(v: string) {
    const m = v === 'movie' || v === 'series' ? v : 'all';
    if (m !== typeFilter) {
      typeFilter = m;
      paintSearch();
    }
  },
  useQ(q: string) {
    const i = document.getElementById('sinput') as HTMLInputElement | null;
    const sbar = document.getElementById('sbar');
    if (i) i.value = q;
    if (sbar) sbar.classList.toggle('has', !!q);
    if (q.length >= 2) runSearch(q);
  },
  clearQ() {
    Store.clearQ();
    paintQHist();
    toast('Riwayat pencarian dihapus.', 'ok');
  },
  random: randomResult,
  currentQuery: () => lastQuery
};
