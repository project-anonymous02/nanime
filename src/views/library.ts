import { Store } from '../core/store';
import { esc, relTime } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { footerHTML, stateHTML } from '../ui/components';
import { watchHref, type ParsedRoute } from '../core/router';
import { FavoriteActions, bindFavSearch } from './favorite';
import { HistoryActions } from './history';
import { statsBodyHTML } from './stats';

const host = () => document.getElementById('view') as HTMLElement;

export type LibTab = 'continue' | 'fav' | 'hist' | 'stats';

const TABS: { id: LibTab; label: string }[] = [
  { id: 'continue', label: 'Lanjutkan' },
  { id: 'fav', label: 'Favorit' },
  { id: 'hist', label: 'Riwayat' },
  { id: 'stats', label: 'Statistik' }
];

function normalizeTab(t: string): LibTab {
  return TABS.some(x => x.id === t) ? (t as LibTab) : 'continue';
}

function continueBody(): string {
  const cont = Store.cont;
  if (!cont.length) {
    return stateHTML(
      'empty',
      'Belum Ada yang Berjalan',
      'Tonton sebuah episode dan hentikan di tengah — progresnya akan muncul di sini untuk dilanjutkan kapan saja.',
      '<a class="btn primary" href="#/home" style="margin-top:6px">' + svg('play', '', 2) + ' Mulai Menonton</a>'
    );
  }
  return (
    '<div class="cw-list">' +
    cont
      .slice(0, 20)
      .map(c => {
        const pct = Math.max(4, Math.min(100, Math.round(c.pct || 0)));
        return (
          '<a class="cw" href="' + watchHref(c.id, c.provider || 'otakudesu', c.ep, c.eid || '', c.eslug || '', c.slug) + '">' +
          '<span class="th"><img src="' + esc(c.cover || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></span>' +
          '<span class="info"><b>' + esc(c.title) + '</b><span class="sub">Episode ' + esc(c.ep) + ' · ' + relTime(c.last || c.t || Date.now()) + '</span>' +
          '<span class="bar"><i style="width:' + pct + '%"></i></span></span>' +
          '<span class="go">' + svg('play', '', 2.2) + '</span></a>'
        );
      })
      .join('') +
    '</div>'
  );
}

function favBody(): string {
  if (!Store.favs.length) {
    /* Kotak #favBox kosong ditangani paint() favorit dengan empty-state-nya sendiri. */
    return '<div id="favBox"></div>';
  }
  return (
    '<div class="searchbar" style="margin-bottom:12px"><span class="sic">' + svg('search', '', 2) + '</span>' +
    '<input id="favQ" type="search" placeholder="Cari di favorit…" aria-label="Cari favorit"></div>' +
    '<div class="filters" style="padding-top:0" id="favSort">' +
    '<button class="chip on" data-act="fav-sort" data-v="recent">Terbaru</button>' +
    '<button class="chip" data-act="fav-sort" data-v="az">A–Z</button>' +
    '<button class="chip" data-act="fav-sort" data-v="score">Rating</button>' +
    '</div><div id="favBox"></div>' +
    '<div style="display:flex;gap:9px;margin-top:20px;flex-wrap:wrap">' +
    '<button class="btn danger sm" data-act="clear-fav">' + svg('trash', '', 2) + ' Kosongkan</button></div>'
  );
}

function histBody(): string {
  if (!Store.hist.length) return '<div id="histBox"></div>';
  return (
    '<div id="histBox"></div>' +
    '<div style="display:flex;gap:9px;margin-top:20px;flex-wrap:wrap">' +
    '<button class="btn danger sm" data-act="clear-hist">' + svg('trash', '', 2) + ' Hapus Riwayat</button></div>'
  );
}

export async function ViewLibrary(r: ParsedRoute): Promise<void> {
  const tab = normalizeTab(r.q.t || 'continue');

  host().innerHTML =
    '<div class="shell" style="padding-top:22px">' +
    '<div class="rv in" style="margin-bottom:16px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Library</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">' +
      Store.cont.length + ' lanjut · ' + Store.favs.length + ' favorit · ' + Store.hist.length + ' riwayat — tersimpan lokal di perangkat ini</p></div>' +
    '<div class="filters" id="libTabs" style="padding-top:0;margin-bottom:18px">' +
    TABS.map(t =>
      '<a class="chip' + (t.id === tab ? ' on' : '') + '" href="#/library?t=' + t.id + '"' +
      (t.id === tab ? ' aria-current="page"' : '') + '>' + t.label + '</a>'
    ).join('') +
    '</div>' +
    '<div id="libBody"></div>' +
    footerHTML() + '</div>';

  const body = document.getElementById('libBody');
  if (!body) return;

  if (tab === 'continue') {
    body.innerHTML = continueBody();
  } else if (tab === 'fav') {
    body.innerHTML = favBody();
    FavoriteActions.repaint();
    bindFavSearch();
  } else if (tab === 'hist') {
    body.innerHTML = histBody();
    HistoryActions.repaint();
  } else {
    body.innerHTML = statsBodyHTML();
  }

  initView(host());
}

/** Render ulang isi tab yang sedang aktif (dipanggil aksi global seperti hapus favorit/riwayat). */
export function refreshLibTab(): void {
  if ((location.hash || '').indexOf('#/library') !== 0) return;
  const r = { q: {} } as ParsedRoute;
  const m = /[?&]t=([^&]+)/.exec(location.hash);
  r.q = m ? { t: decodeURIComponent(m[1]) } : {};
  ViewLibrary(r);
}
