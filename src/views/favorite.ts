import { Store } from '../core/store';
import { esc, debounce } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { footerHTML, stateHTML } from '../ui/components';
import { detailHref, type ParsedRoute } from '../core/router';
import type { FavItem } from '../core/types';

const host = () => document.getElementById('view') as HTMLElement;

type SortMode = 'recent' | 'az' | 'score';
let favSort: SortMode = 'recent';
let favQuery = '';

function matches(f: FavItem): boolean {
  if (!favQuery) return true;
  return (f.title || '').toLowerCase().indexOf(favQuery.toLowerCase()) > -1;
}

function sorted(): FavItem[] {
  let list = Store.favs.filter(matches);
  if (favSort === 'az') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (favSort === 'score') list = [...list].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
  return list;
}

function paint(): void {
  const box = document.getElementById('favBox');
  if (!box) return;
  const list = sorted();
  if (!Store.favs.length) {
    box.innerHTML =
      '<div class="state rv in"><div class="ic" style="color:var(--love);background:linear-gradient(150deg,rgba(255,77,109,.12),rgba(255,77,109,.02));border-color:rgba(255,77,109,.18)">' +
      svg('heart', '', 1.7) + '</div><h3>Belum Ada Favorit</h3>' +
      '<p>Ketuk ikon hati pada poster anime untuk menyimpannya di sini.</p>' +
      '<a class="btn primary" href="#/home" style="margin-top:6px">' + svg('compass', '', 2) + ' Mulai Jelajahi</a></div>';
    return;
  }
  if (!list.length) {
    box.innerHTML = stateHTML('search', 'Tidak Cocok', 'Tidak ada favorit yang cocok dengan pencarian ini.', '');
    return;
  }
  box.innerHTML =
    '<div class="grid wide">' +
    list
      .map(
        (f, i) =>
          '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms">' +
          '<a class="card g" href="' + detailHref(f.id, f.provider || '', f.slug) + '">' +
          '<div class="poster"><span class="perr" aria-hidden="true">' + svg('film', '', 1.7) + '</span>' +
          '<img src="' + esc(f.cover || '') + '" class="ld" alt="' + esc(f.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<div class="veil"></div>' +
          (f.score ? '<span class="badge score">' + svg('star', '', 1.8) + ' ' + esc(f.score) + '</span>' : '') +
          '<div class="play-ov"><span class="cir">' + svg('play') + '</span></div></div>' +
          '<div class="body"><div class="nm">' + esc(f.title) + '</div>' +
          '<div class="meta">' + [f.epLabel, f.sub, f.type].filter(Boolean).map(esc).join('<i></i>') + '</div></div></a>' +
          '<button class="fav-btn on" data-fav="' + esc(f.id) + '" data-provider="' + esc(f.provider || '') +
            '" data-cover="' + esc(f.cover || '') + '" data-title="' + esc(f.title) +
            '" data-score="' + esc(f.score || '') + '" data-epl="' + esc(f.epLabel || '') + '" data-sub="' + esc(f.sub || '') +
            '" data-type="' + esc(f.type || '') + '" data-slug="' + esc(f.slug || '') +
            '" aria-label="Hapus favorit" aria-pressed="true">' + svg('heart', '', 2.1) + '</button>' +
          '</div>'
      )
      .join('') +
    '</div>';
  initView(box);
}

/** Ikat pencarian favorit pada input #favQ (dipakai halaman Favorite & tab Library). */
export function bindFavSearch(): void {
  const q = document.getElementById('favQ') as HTMLInputElement | null;
  if (!q) return;
  q.addEventListener(
    'input',
    debounce(() => {
      favQuery = q.value.trim();
      paint();
    }, 200)
  );
}

export async function ViewFavorite(_r?: ParsedRoute): Promise<void> {
  const favs = Store.favs;
  host().innerHTML =
    '<div class="shell" style="padding-top:22px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Favorite</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">' +
      (favs.length ? favs.length + ' anime tersimpan' : 'Koleksi pribadi Anda') + '</p></div>' +
    (favs.length
      ? '<div class="searchbar" style="margin-bottom:12px"><span class="sic">' + svg('search', '', 2) + '</span>' +
        '<input id="favQ" type="search" placeholder="Cari di favorit…" value="' + esc(favQuery) + '" aria-label="Cari favorit">' +
        '</div><div class="filters" style="padding-top:0" id="favSort">' +
        '<button class="chip' + (favSort === 'recent' ? ' on' : '') + '" data-act="fav-sort" data-v="recent">Terbaru</button>' +
        '<button class="chip' + (favSort === 'az' ? ' on' : '') + '" data-act="fav-sort" data-v="az">A–Z</button>' +
        '<button class="chip' + (favSort === 'score' ? ' on' : '') + '" data-act="fav-sort" data-v="score">Rating</button>' +
        '<button class="chip" data-act="export-data">' + svg('download', '', 2) + ' Ekspor</button>' +
        '</div>'
      : '') +
    '<div id="favBox"></div>' +
    (favs.length
      ? '<div style="display:flex;gap:9px;margin-top:22px;flex-wrap:wrap"><button class="btn danger sm" data-act="clear-fav">' +
        svg('trash', '', 2) + ' Kosongkan</button></div>'
      : '') +
    footerHTML() + '</div>';

  paint();
  bindFavSearch();
}

export const FavoriteActions = {
  setSort(v: string) {
    favSort = (v === 'az' || v === 'score' ? v : 'recent') as SortMode;
    /* Perbarui chip aktif di tempat (halaman Favorite maupun tab Library). */
    document.querySelectorAll<HTMLElement>('#favSort [data-act="fav-sort"]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-v') === favSort);
    });
    paint();
  },
  setQuery(v: string) {
    favQuery = v;
    paint();
  },
  repaint: paint
};
