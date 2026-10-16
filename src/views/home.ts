import { API } from '../core/api';
import { progress } from '../core/client';
import { detailHref, watchHref, type ParsedRoute } from '../core/router';
import { Store } from '../core/store';
import { esc, relTime } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { dropRailArrows, footerHTML, gridItems, railItems, secHead, skCards, stateHTML } from '../ui/components';
import { toast } from '../ui/toast';
import { trendingMeta } from '../metadata';

export const view = () => document.getElementById('view') as HTMLElement;

const HOME_COPY: Record<string, { a: string[]; b: string[]; c: string[] | null }> = {
  otakudesu: { a: ['Sedang Tayang', 'Anime yang sedang rilis saat ini'], b: ['Anime Selesai', 'Koleksi anime yang telah tamat'], c: null },
  oploverz: { a: ['Populer Hari Ini', 'Paling banyak ditonton hari ini'], b: ['Rilis Terbaru', 'Episode terbaru yang baru saja rilis'], c: null },
  kuramanime: { a: ['Sedang Tayang', 'Episode terbaru dari Kuramanime'], b: ['Anime Selesai', 'Koleksi anime yang telah tamat'], c: ['Film Anime', 'Daftar movie dari Kuramanime'] }
};

let POOL: string[] = [];

function continueHTML(): string {
  const list = Store.cont;
  if (!list.length) return '';
  return (
    '<section class="sec" id="secCont">' +
    secHead('Lanjutkan Menonton', 'Terakhir kamu tonton', 'railCont', '#/history') +
    '<div class="rail" data-railwrap="wc"><div class="rail-track" id="railCont">' +
    list.map((c, i) => {
      const pct = Math.max(4, Math.min(100, Math.round(c.pct || 0)));
      return (
        '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms"><a class="cw" style="width:290px" href="' +
        watchHref(c.id, c.provider || 'otakudesu', c.ep, c.eid || '', c.eslug || '', c.slug) + '">' +
        '<span class="th"><img src="' + esc(c.cover || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></span>' +
        '<span class="info"><b>' + esc(c.title) + '</b>' +
        '<span class="sub">Episode ' + esc(c.ep) + ' · ' + relTime(c.last || c.t || Date.now()) + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="go">' + svg('play', '', 2.2) + '</span>' +
        '<span class="x" data-act="del-cont" data-id="' + esc(c.id) + '" data-provider="' + esc(c.provider || '') + '" role="button" aria-label="Hapus">' + svg('x', '', 2.4) + '</span>' +
        '</a></div>'
      );
    }).join('') +
    '</div></div></section>'
  );
}

function randomBtn(): string {
  return '<button class="btn ghost sm" data-act="random-anime">' + svg('dice', '', 2) + ' Acak</button>';
}

export async function ViewHome(_r: ParsedRoute): Promise<void> {
  const host = view();
  const provider = Store.getProvider();
  const cp = HOME_COPY[provider] || HOME_COPY.otakudesu;

  host.innerHTML =
    '<div class="shell">' +
    '<section class="hero" aria-label="Nanime">' +
    '<div class="hero-in">' +
    '<div class="hero-row">' +
    '<div class="logo-wrap"><div class="logo-inner"><img src="logo.jpg" alt="Logo" width="62" height="62" draggable="false"></div></div>' +
    '<div class="hero-tx"><h1 class="hero-title">NANIME</h1><p class="hero-tag">Streaming anime premium · <b>Multi-sumber otomatis</b></p><p class="hero-cr">Made By Nata, using third-party public APIs — we host nothing, own nothing. Support the official releases.</p></div>' +
    '</div>' +
    '<a class="hero-search" href="#/search" aria-label="Cari anime">' +
    '<span class="sic">' + svg('search', '', 2) + '</span>' +
    '<span class="ph">Cari judul anime (English/Japanese)…</span>' +
    '<span class="go">' + svg('right', '', 2.3) + '</span>' +
    '</a>' +
    '<div class="hero-cta">' +
    '<a class="btn ghost sm" href="#/explore">' + svg('compass', '', 2) + ' Jelajah</a>' +
    '<a class="btn ghost sm" href="#/schedule">' + svg('cal', '', 2) + ' Jadwal</a>' +
    '<a class="btn ghost sm" href="#/favorite">' + svg('heart', '', 2) + ' Favorit</a>' +
    '<a class="btn ghost sm" href="#/history">' + svg('clock', '', 2) + ' Riwayat</a>' +
    randomBtn() +
    '</div>' +
    '</div></section>' +
    continueHTML() +
    '<section class="sec" id="secNew">' + secHead('Baru Rilis', 'Episode terbaru dari sumber anime', undefined, '#/explore') +
      '<div class="grid" id="gridNew">' + skCards(10, true) + '</div></section>' +
    '<section class="sec" id="secTrend">' + secHead('Trending Global', 'Anime populer minggu ini (AniList)', 'railTrend') +
      '<div class="rail" data-railwrap="wt"><div class="rail-track" id="railTrend">' + skCards(8) + '</div></div></section>' +
    '<section class="sec" id="secOngoing">' + secHead(cp.a[0], cp.a[1], 'railOngoing', '#/explore') +
      '<div class="rail" data-railwrap="w1"><div class="rail-track" id="railOngoing">' + skCards(10) + '</div></div></section>' +
    '<section class="sec" id="secGenre">' + secHead('Jelajah Genre', 'Ketuk untuk menyaring katalog') +
      '<div class="filters" id="genreRow" style="padding:2px"><div class="sk" style="width:80px;height:34px;border-radius:99px"></div><div class="sk" style="width:100px;height:34px;border-radius:99px"></div><div class="sk" style="width:90px;height:34px;border-radius:99px"></div></div></section>' +
    '<section class="sec" id="secSched" style="display:none">' + secHead('Jadwal Hari Ini', 'Rilis episode hari ini', 'railSched', '#/schedule') +
      '<div class="rail" data-railwrap="ws"><div class="rail-track" id="railSched">' + skCards(8) + '</div></div></section>' +
    '<section class="sec" id="secCompleted">' + secHead(cp.b[0], cp.b[1], 'railCompleted', '#/explore') +
      '<div class="rail" data-railwrap="w2"><div class="rail-track" id="railCompleted">' + skCards(10) + '</div></div></section>' +
    '<section class="sec" id="secMovie" style="display:none">' + secHead((cp.c && cp.c[0]) || 'Film Anime', 'Anime movie terbaru', 'railMovie') +
      '<div class="rail" data-railwrap="w3"><div class="rail-track" id="railMovie">' + skCards(10) + '</div></div></section>' +
    '<div id="homeNet"></div>' +
    footerHTML() + '</div>';

  loadTrendingRail();

  try {
    progress(true, 20);
    const [homeResult, genres, movieResult] = await Promise.all([API.home(), API.genres(), API.movies()]);
    progress(true, 80);

    const ong = homeResult.ongoing;
    const cmp = homeResult.completed;
    POOL = [...ong, ...cmp].map(a => a.id).filter(Boolean);
    const rOng = document.getElementById('railOngoing');
    const rCmp = document.getElementById('railCompleted');
    if (rOng) rOng.innerHTML = ong.length ? railItems(ong) : '<div class="ep-empty">Belum ada data anime di bagian ini.</div>';
    if (!ong.length) dropRailArrows('#secOngoing');
    const gNew = document.getElementById('gridNew');
    const secNew = document.getElementById('secNew');
    if (gNew && ong.length) gNew.innerHTML = gridItems(ong.slice(0, 10));
    else if (secNew) secNew.remove();
    if (rCmp) rCmp.innerHTML = cmp.length ? railItems(cmp) : '<div class="ep-empty">Belum ada data anime di bagian ini.</div>';
    if (!cmp.length) dropRailArrows('#secCompleted');

    const secMovie = document.getElementById('secMovie');
    if (secMovie) {
      const own = provider === 'kuramanime' ? homeResult.movie || [] : [];
      const mov = own.concat(movieResult.items || []);
      if (mov.length) {
        secMovie.style.display = '';
        const el = document.getElementById('railMovie');
        if (el) el.innerHTML = railItems(mov);
      } else if (movieResult.error) {
        secMovie.style.display = '';
        const el = document.getElementById('railMovie');
        if (el) el.innerHTML = '<div class="ep-empty">Film tidak dapat dimuat saat ini.</div>';
        dropRailArrows('#secMovie');
      } else {
        secMovie.remove();
      }
    }

    if (genres.length) {
      const row = document.getElementById('genreRow');
      if (row) {
        row.innerHTML = genres
          .map(g => '<a class="chip" href="#/genre/' + encodeURIComponent(g.genreId) + '?title=' + encodeURIComponent(g.title) + '">' + esc(g.title) + '</a>')
          .join('');
      }
    }

    progress(true, 100);
    setTimeout(() => progress(false), 300);
    initView(host);

    /* jadwal hari ini — dimuat terpisah supaya tidak memperlambat beranda */
    loadTodaySchedule();
  } catch (e: any) {
    progress(false);
    const sec = document.getElementById('secOngoing');
    if (sec) {
      sec.innerHTML = stateHTML(
        'err',
        'Gagal memuat beranda',
        e?.message || 'Terjadi kesalahan.',
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Coba lagi</button>'
      );
    }
    dropRailArrows('#secOngoing');
  }
}

async function loadTrendingRail(): Promise<void> {
  try {
    const list = await trendingMeta(12);
    const sec = document.getElementById('secTrend');
    const rail = document.getElementById('railTrend');
    if (!sec || !rail) return;
    if (!list.length) {
      sec.remove();
      return;
    }
    rail.innerHTML = list
      .map((m, i) => {
        const search = '#/search?q=' + encodeURIComponent(m.title);
        const metaBits = [m.format, m.year ? String(m.year) : ''].filter(Boolean);
        return (
          '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms"><a class="card" href="' + search + '" aria-label="' + esc(m.title) + '">' +
          '<div class="poster">' +
          '<span class="perr" aria-hidden="true">' + svg('film', '', 1.7) + '</span>' +
          '<img data-src="' + esc(m.cover || '') + '" alt="' + esc(m.title) + '" loading="lazy" onload="this.classList.add(\'ld\')" onerror="this.style.display=\'none\'">' +
          '<div class="veil"></div>' +
          '<span class="badge">AniList</span>' +
          (m.score ? '<span class="badge score">' + svg('star', '', 1.8) + ' ' + esc(String(m.score)) + '</span>' : '') +
          '<div class="play-ov"><span class="cir">' + svg('play') + '</span></div>' +
          '</div>' +
          '<div class="body"><div class="nm">' + esc(m.title) + '</div>' +
          '<div class="meta">' + metaBits.map(esc).join('<i></i>') + '</div></div></a></div>'
        );
      })
      .join('');
    dropRailArrows('#secTrend');
    initView(sec);
  } catch (e) {
    console.warn('Trending metadata gagal:', e);
    const sec = document.getElementById('secTrend');
    if (sec) sec.remove();
  }
}

async function loadTodaySchedule(): Promise<void> {
  try {
    const groups = await API.schedule();
    const today = new Date().getDay();
    const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const g = groups.find(x => x.day === names[today]) || groups[0];
    const sec = document.getElementById('secSched');
    const rail = document.getElementById('railSched');
    if (!sec || !rail) return;
    if (!g || !g.items.length) {
      sec.remove();
      return;
    }
    sec.style.display = '';
    rail.innerHTML = g.items.slice(0, 12).map((it, i) =>
      '<div class="rv-s" style="--d:' + (i * 30) + 'ms"><a class="sched-row" style="width:250px" href="' +
      detailHref(it.id, it.provider, it.slug) + '">' +
      (it.time ? '<span class="tm">' + esc(it.time) + '</span>' : '') +
      '<span class="tx"><b>' + esc(it.title) + '</b><span>' + esc(g.day) + '</span></span></a></div>'
    ).join('');
    dropRailArrows('#secSched');
    initView(sec);
  } catch {
    const sec = document.getElementById('secSched');
    if (sec) sec.remove();
  }
}

export function homeRandom(): void {
  const pick = () => {
    if (!POOL.length) {
      toast('Belum ada data untuk diacak.', 'err');
      return;
    }
    const id = POOL[Math.floor(Math.random() * POOL.length)];
    location.hash = '#/anime/' + encodeURIComponent(id) + '?provider=' + encodeURIComponent(Store.getProvider());
  };
  if (POOL.length) return pick();
  API.ongoing(1)
    .then(r => {
      POOL = r.list.map(a => a.id).filter(Boolean);
      pick();
    })
    .catch(() => toast('Gagal memuat daftar untuk diacak.', 'err'));
}
