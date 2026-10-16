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
import type { Card } from '../core/types';

export const view = () => document.getElementById('view') as HTMLElement;

let POOL: { id: string; provider: string; title: string }[] = [];

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

function heroHTML(): string {
  return (
    '<section class="hero" aria-label="Nanime">' +
    '<div class="hero-in">' +
    '<div class="hero-row">' +
    '<div class="logo-wrap"><div class="logo-inner"><img src="logo.jpg" alt="Logo" width="62" height="62" draggable="false"></div></div>' +
    '<div class="hero-tx"><h1 class="hero-title">NANIME</h1><p class="hero-tag">Streaming anime · <b>Multi-sumber otomatis</b></p>' +
    '<p class="hero-cr">Made By Nata, using third-party public APIs — we host nothing, own nothing. Support the official releases.</p></div>' +
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
    '</div></section>'
  );
}

/** Buang kartu duplikat (id + provider sama). */
function dedupe(list: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of list) {
    const k = (c.provider || '') + ':' + c.id;
    if (!c.id || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export async function ViewHome(_r: ParsedRoute): Promise<void> {
  const host = view();

  /* Susunan ala Wibuku: Baru Rilis (poster besar) → Sedang Tayang → Populer →
     Selesai Tayang → Jadwal Hari Ini → Rekomendasi → Genre. */
  host.innerHTML =
    '<div class="shell">' +
    heroHTML() +
    continueHTML() +
    '<section class="sec" id="secNew">' + secHead('Baru Rilis', 'Episode terbaru dari semua sumber', undefined, '#/explore') +
      '<div class="grid" id="gridNew">' + skCards(10, true) + '</div></section>' +
    '<section class="sec" id="secOngoing">' + secHead('Sedang Tayang', 'Anime yang sedang rilis saat ini', 'railOngoing', '#/explore') +
      '<div class="rail" data-railwrap="w1"><div class="rail-track" id="railOngoing">' + skCards(10) + '</div></div></section>' +
    '<section class="sec" id="secTrend">' + secHead('Populer', 'Paling banyak dicari minggu ini', 'railTrend') +
      '<div class="rail" data-railwrap="wt"><div class="rail-track" id="railTrend">' + skCards(8) + '</div></div></section>' +
    '<section class="sec" id="secCompleted">' + secHead('Selesai Tayang', 'Koleksi anime yang telah tamat', 'railCompleted', '#/explore') +
      '<div class="rail" data-railwrap="w2"><div class="rail-track" id="railCompleted">' + skCards(10) + '</div></div></section>' +
    '<section class="sec" id="secSched" style="display:none">' + secHead('Jadwal Hari Ini', 'Rilis episode hari ini', 'railSched', '#/schedule') +
      '<div class="rail" data-railwrap="ws"><div class="rail-track" id="railSched">' + skCards(8) + '</div></div></section>' +
    '<section class="sec" id="secReco">' + secHead('Rekomendasi Untukmu', 'Pilihan dari katalog', 'railReco') +
      '<div class="rail" data-railwrap="wr"><div class="rail-track" id="railReco">' + skCards(10) + '</div></div></section>' +
    '<section class="sec" id="secGenre">' + secHead('Genre', 'Ketuk untuk menyaring katalog') +
      '<div class="filters" id="genreRow" style="padding:2px"></div></section>' +
    '<div id="homeNet"></div>' +
    footerHTML() + '</div>';

  /* Sekunder — dimuat terpisah agar tidak memblokir render utama
     (mencegah beranda tampak kosong/lama saat sumber tertentu lambat). */
  void loadTrendingRail();
  void loadGenres();
  void loadTodaySchedule();
  void loadMoviesRail();

  try {
    progress(true, 30);
    const homeResult = await API.home();
    progress(true, 80);

    const ong = homeResult.ongoing;
    const cmp = homeResult.completed;
    POOL = dedupe([...ong, ...cmp]).map(a => ({ id: a.id, provider: a.provider, title: a.title }));

    const rOng = document.getElementById('railOngoing');
    const rCmp = document.getElementById('railCompleted');
    const gNew = document.getElementById('gridNew');
    const secNew = document.getElementById('secNew');

    if (gNew && ong.length) gNew.innerHTML = gridItems(ong.slice(0, 10), 26);
    else if (secNew) secNew.remove();

    if (rOng) {
      rOng.innerHTML = ong.length ? railItems(ong) : '<div class="ep-empty">Belum ada data untuk bagian ini.</div>';
      if (!ong.length) dropRailArrows('#secOngoing');
    }
    if (rCmp) {
      rCmp.innerHTML = cmp.length ? railItems(cmp) : '<div class="ep-empty">Belum ada data untuk bagian ini.</div>';
      if (!cmp.length) dropRailArrows('#secCompleted');
    }

    const reco = dedupe([...ong, ...cmp]).slice(0, 14);
    const rReco = document.getElementById('railReco');
    if (rReco) {
      if (reco.length) rReco.innerHTML = railItems(reco);
      else {
        const s = document.getElementById('secReco');
        if (s) s.remove();
      }
    }

    progress(true, 100);
    setTimeout(() => progress(false), 260);
    initView(host);
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
      dropRailArrows('#secOngoing');
    }
  }
}

async function loadGenres(): Promise<void> {
  const sec = document.getElementById('secGenre');
  const row = document.getElementById('genreRow');
  if (!sec || !row) return;
  try {
    const genres = await API.genres();
    if (!genres.length) {
      sec.remove();
      return;
    }
    row.innerHTML = genres
      .map(g => '<a class="chip" href="#/genre/' + encodeURIComponent(g.genreId) + '?title=' + encodeURIComponent(g.title) + '">' + esc(g.title) + '</a>')
      .join('');
    initView(sec);
  } catch {
    sec.remove();
  }
}

/** Tambahkan kartu film ke rail Rekomendasi bila tersedia (tanpa memblokir beranda). */
async function loadMoviesRail(): Promise<void> {
  const rail = document.getElementById('railReco');
  if (!rail) return;
  try {
    const r = await API.movies();
    if (!r.items || !r.items.length || !document.body.contains(rail)) return;
    const current = dedupe([...r.items, ...((rail as any)._list || [])]);
    (rail as any)._list = current;
    rail.innerHTML = railItems(current);
    initView(rail.parentElement || rail);
  } catch {
    /* film opsional */
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
          (m.score ? '<span class="badge score">' + svg('star', '', 1.8) + ' ' + esc(String(m.score)) + '</span>' : '') +
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
      detailHref(it.id, it.provider, it.slug, it.title) + '">' +
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
    const it = POOL[Math.floor(Math.random() * POOL.length)];
    location.hash = detailHref(it.id, it.provider, undefined, it.title);
  };
  if (POOL.length) return pick();
  API.ongoing(1)
    .then(r => {
      POOL = r.list.filter(a => a.id).map(a => ({ id: a.id, provider: a.provider, title: a.title }));
      pick();
    })
    .catch(() => toast('Gagal memuat daftar untuk diacak.', 'err'));
}
