import { PROVIDERS } from '../core/config';
import { API } from '../core/api';
import { progress } from '../core/client';
import { Store } from '../core/store';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { cardHTML, downloadGroupsHTML, footerHTML, stateHTML } from '../ui/components';
import { toast } from '../ui/toast';
import { go, watchHref, type ParsedRoute } from '../core/router';
import { resolveMovieSource } from '../core/movies';
import type { Detail, DownloadLink, EpisodeItem } from '../core/types';

const host = () => document.getElementById('view') as HTMLElement;

export const DetailState: { det: Detail | null; ep: EpisodeItem[] } = { det: null, ep: [] };

const STATUS: { v: 'ptw' | 'watching' | 'completed' | 'dropped'; l: string }[] = [
  { v: 'ptw', l: 'Ingin Tonton' },
  { v: 'watching', l: 'Sedang Tonton' },
  { v: 'completed', l: 'Selesai' },
  { v: 'dropped', l: 'Dropped' }
];

function personalPanel(id: string): string {
  const meta = Store.meta[id] || { status: 'ptw' as const, rating: 0, t: 0 };
  const stars = [1, 2, 3, 4, 5]
    .map(
      n =>
        '<button class="' + (meta.rating >= n ? 'on' : '') + '" data-act="rate" data-v="' + n +
        '" aria-label="Beri rating ' + n + '">' + svg('star', '', 2) + '</button>'
    )
    .join('');
  return (
    '<section class="panel rv" id="personal"><h3>' + svg('heart', '', 2) + ' Koleksi Pribadi</h3>' +
    '<div class="seg" style="margin-bottom:12px">' +
    STATUS.map(
      s =>
        '<button class="' + (meta.status === s.v ? 'on' : '') + '" data-act="set-status" data-v="' + s.v + '">' +
        s.l + '</button>'
    ).join('') +
    '</div><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
    '<span style="font-size:12.4px;color:var(--dim)">Penilaianmu</span>' +
    '<div class="stars" id="stars">' + stars + '</div>' +
    '<button class="btn ghost sm" data-act="rate" data-v="0">Hapus</button>' +
    '</div></section>'
  );
}

function downloadPanel(downloads: DownloadLink[], batchId?: string): string {
  const hasBatch = !!batchId;
  if (!downloads.length && !hasBatch) return '';
  return (
    '<section class="panel rv" id="dlPanel"><h3>' + svg('download', '', 2) + ' Unduhan</h3>' +
    '<div id="dlBody">' +
    (downloads.length
      ? downloadGroupsHTML(downloads)
      : '<div class="ep-empty">Unduhan per-episode tidak tersedia di provider ini.</div>') +
    '</div>' +
    (hasBatch
      ? '<div style="margin-top:12px"><button class="btn ghost sm" data-act="load-batch">' + svg('layers', '', 2) + ' Muat Unduhan Batch</button></div>'
      : '') +
    '</section>'
  );
}

export function renderDownloadBody(links: DownloadLink[]): void {
  const body = document.getElementById('dlBody');
  if (!body) return;
  if (!links.length) {
    body.innerHTML = '<div class="ep-empty">Tidak ada link unduhan yang valid.</div>';
    return;
  }
  body.innerHTML = downloadGroupsHTML(links);
}

export async function loadBatchDownloads(batchId: string): Promise<void> {
  try {
    progress(true, 40);
    const links = await API.batchDownloads(batchId);
    progress(true, 100);
    setTimeout(() => progress(false), 200);
    renderDownloadBody(links);
    if (!links.length) toast('Batch tidak memiliki link unduhan.', 'err');
  } catch (e: any) {
    progress(false);
    toast(e?.message || 'Gagal memuat unduhan batch.', 'err');
  }
}

export async function ViewDetail(r: ParsedRoute): Promise<void> {
  const param = r.parts[1] || '';
  const provider = r.q.provider || Store.getProvider();
  DetailState.det = null;
  DetailState.ep = [];

  host().innerHTML = '<div class="shell"><div style="height:280px;border-radius:var(--r3);margin-top:18px" class="sk"></div></div>';

  try {
    progress(true, 30);
    const anime = await API.detail(provider, param, r.q.slug || '');
    progress(true, 100);
    setTimeout(() => progress(false), 260);
    renderDetail(anime);
  } catch (e: any) {
    progress(false);
    const notFound = e && e.status === 404;
    const msg = notFound
      ? 'Anime tidak ditemukan pada provider ini. Judul mungkin sudah dipindah atau salah eja.'
      : e.message || 'Terjadi kesalahan.';
    host().innerHTML =
      '<div class="shell" style="padding-top:40px">' +
      stateHTML(
        notFound ? 'empty' : 'err',
        notFound ? 'Tidak Ditemukan' : 'Gagal memuat detail',
        msg,
        '<div style="display:flex;gap:9px;flex-wrap:wrap;justify-content:center;margin-top:12px">' +
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Coba lagi</button>' +
        '<a class="btn ghost" href="#/home">Beranda</a></div>'
      ) + '</div>';
  }
}

export function renderDetail(anime: Detail): void {
  DetailState.det = anime;
  const EP = anime.episodeList || [];
  DetailState.ep = EP;
  const fav = Store.isFav(anime.id, anime.provider);
  const movieFlow = anime.provider === 'kusonime' || /movie/i.test(anime.type || '');
  const hist = Store.hist.find(h => h.id === anime.id && (h.provider || '') === (anime.provider || ''));
  const cont = Store.cont.find(c => c.id === anime.id && (c.provider || '') === (anime.provider || ''));
  const dLink = watchHref(
    anime.id,
    anime.provider,
    hist?.ep || EP[0]?.num || '1',
    hist?.eid || EP[0]?.id || '',
    hist?.eslug || EP[0]?.slug || '',
    anime.slug
  );

  const genreSec =
    anime.genres && anime.genres.length
      ? '<section class="panel rv"><h3>' + svg('compass', '', 2) + ' Genre</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' +
        anime.genres
          .map(g =>
            g && g.id
              ? '<a class="chip" href="#/genre/' + encodeURIComponent(g.id) + '?title=' + encodeURIComponent(g.t || '') + '">' + esc(g.t || '') + '</a>'
              : '<span class="chip">' + esc((g && g.t) || '') + '</span>'
          )
          .join('') +
        '</div></section>'
      : '';

  const recSec =
    anime.recommendations && anime.recommendations.length
      ? '<section class="panel rv"><h3>' + svg('compass', '', 2) + ' Rekomendasi <span style="font-size:11.5px;color:var(--dim);font-weight:500">· ' +
        anime.recommendations.length + ' judul</span></h3><div class="grid wide">' +
        anime.recommendations.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * 30) + 'ms">' + cardHTML(a, { g: true }) + '</div>').join('') +
        '</div></section>'
      : '';

  host().innerHTML =
    '<div class="detail-hero">' +
    (anime.poster ? '<div class="bd" style="background-image:url(\'' + esc(anime.poster) + '\')"></div>' : '') +
    '<div class="shell"><div class="detail-in">' +
    '<div class="cover-box"><div class="in"><img src="' + esc(anime.poster) + '" alt="Poster ' + esc(anime.title) + '" loading="eager"></div></div>' +
    '<div class="detail-meta">' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">' +
    '<span class="badge" style="position:static">' + esc((PROVIDERS[anime.provider] && PROVIDERS[anime.provider].name) || anime.provider) + '</span>' +
    (anime.status ? '<span class="badge" style="position:static">' + esc(anime.status) + '</span>' : '') +
    (anime.year ? '<span class="badge" style="position:static">' + esc(anime.year) + '</span>' : '') +
    '</div>' +
    '<h1>' + esc(anime.title) + '</h1>' +
    (anime.alt ? '<div class="alt">' + esc(anime.alt) + '</div>' : '') +
    '<div class="stats">' +
    (anime.score ? '<span class="stat">' + svg('star', '', 1.8) + ' <b>' + esc(anime.score) + '</b></span>' : '') +
    (anime.type ? '<span class="stat">' + svg('film', '', 1.9) + ' <b>' + esc(anime.type) + '</b></span>' : '') +
    (anime.episodes ? '<span class="stat">' + svg('film', '', 1.9) + ' <b>' + esc(String(anime.episodes)) + '</b> Eps</span>' : '') +
    (anime.duration ? '<span class="stat">' + svg('clock', '', 1.9) + ' <b>' + esc(anime.duration) + '</b></span>' : '') +
    (anime.studio ? '<span class="stat">' + svg('compass', '', 1.9) + ' <b>' + esc(anime.studio) + '</b></span>' : '') +
    '</div>' +
    '<div class="detail-actions">' +
    (movieFlow
      ? '<button class="btn primary" data-act="watch-movie">' + svg('play', '', 2.2) + ' Tonton Film</button>'
      : EP.length
        ? '<a class="btn primary" href="' + dLink + '">' + svg('play', '', 2.2) + ' ' +
          (cont ? 'Lanjut EP ' + esc(cont.ep) : 'Tonton EP ' + esc(EP[0].num)) + '</a>'
        : '') +
    '<button class="btn' + (fav ? ' danger' : ' ghost') + '" data-fav="' + esc(anime.id) + '" data-provider="' + esc(anime.provider) +
      '" data-cover="' + esc(anime.poster) + '" data-title="' + esc(anime.title) + '" data-score="' + esc(anime.score || '') +
      '" data-type="' + esc(anime.type || '') + '" data-sub="' + esc(anime.year || '') + '" data-slug="' + esc(anime.slug || '') +
      '" id="bigFav" aria-pressed="' + fav + '">' + (fav ? svg('heart', '', 2.1) + ' Tersimpan' : svg('heart', '', 2.1) + ' Favorit') + '</button>' +
    '<button class="btn ghost" data-act="share-detail">' + svg('share', '', 2.1) + ' Bagikan</button>' +
    '</div></div></div></div></div>' +
    '<div class="shell" style="padding-top:22px;display:grid;gap:16px">' +
    '<div id="movieStream" style="display:none"></div>' +
    '<section class="panel rv"><h3>' + svg('info', '', 2) + ' Sinopsis</h3><div class="syn clip" id="syn">' +
      esc(anime.synopsis || 'Sinopsis tidak tersedia.') + '</div>' +
      ((anime.synopsis || '').length > 340
        ? '<button class="readmore" data-act="toggle-syn">Baca selengkapnya ' + svg('down', '', 2.4) + '</button>'
        : '') +
    '</section>' +
    personalPanel(anime.id) +
    downloadPanel(anime.downloads || [], anime.batchId) +
    genreSec +
    '<section class="panel rv" id="epPanel"><h3>' + svg('film', '', 2) + ' Daftar Episode <span style="font-size:11.5px;color:var(--dim);font-weight:500">· ' +
      EP.length + ' entri</span></h3>' +
    (EP.length
      ? '<div class="ep-grid" style="max-height:380px;overflow:auto">' +
        EP.map((e, i) => {
          const seen = hist && String(hist.ep) === String(e.num);
          const c = cont && String(cont.ep) === String(e.num);
          return (
            '<button class="ep rv-s' + (seen ? ' done' : '') + '" style="--d:' + ((i % 10) * 26) + 'ms" data-ep-idx="' + i +
            '" aria-label="Putar episode ' + esc(e.num) + '">' +
            '<span class="no">' + esc(e.num) + '</span><span class="tx"><b>Episode ' + esc(e.num) + '</b><span>' +
            esc(e.date || '') + (c ? ' · lanjut' : '') + '</span></span><span class="go">' + svg('play', '', 2.2) + '</span></button>'
          );
        }).join('') +
        '</div>'
      : '<div class="ep-empty">Provider ini tidak menyediakan daftar episode.</div>') +
    '</section>' +
    recSec +
    footerHTML() + '</div>';

  initView(host());

  host().querySelectorAll<HTMLElement>('[data-ep-idx]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = +b.getAttribute('data-ep-idx')!;
      const ep = EP[idx];
      if (ep) go('/watch/' + encodeURIComponent(anime.id) + '/' + encodeURIComponent(ep.num) + '?provider=' + encodeURIComponent(anime.provider) + '&eid=' + encodeURIComponent(ep.id) + '&eslug=' + encodeURIComponent(ep.slug || ''));
    });
  });
}

export async function watchMovieFlow(): Promise<void> {
  const DET = DetailState.det;
  if (!DET) return;
  const actEl = document.querySelector<HTMLElement>('[data-act="watch-movie"]');
  const hostEl = document.getElementById('movieStream');
  const label = actEl ? actEl.innerHTML : '';
  if (actEl) {
    (actEl as HTMLButtonElement).disabled = true;
    actEl.innerHTML = svg('refresh', '', 2.1) + ' Memeriksa…';
  }
  if (hostEl) {
    hostEl.style.display = '';
    hostEl.innerHTML =
      '<div class="panel"><div style="display:flex;gap:10px;align-items:center;color:var(--mut);font-size:13px">' +
      svg('search', '', 2) + ' Memeriksa sumber video yang dapat diputar…</div></div>';
    hostEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const res = await resolveMovieSource(DET);
  if (actEl) {
    (actEl as HTMLButtonElement).disabled = false;
    actEl.innerHTML = label;
  }
  if (res) {
    toast('Sumber ditemukan di ' + PROVIDERS[res.provider].name + '.', 'ok');
    go('/watch/' + encodeURIComponent(res.id) + '/' + encodeURIComponent(res.epNum) + '?provider=' + encodeURIComponent(res.provider) + '&eid=' + encodeURIComponent(res.eid || res.epNum) + '&eslug=' + encodeURIComponent(res.eslug || ''));
    return;
  }
  if (hostEl) {
    const mirrors = Array.isArray(DET.downloads) ? DET.downloads : [];
    hostEl.innerHTML =
      '<div class="panel"><h3>' + svg('alert', '', 2) + ' Tidak ada sumber video yang dapat diputar</h3>' +
      '<p style="color:var(--mut);font-size:13px;line-height:1.65;margin:8px 0 0">Sumber film ini hanya menyediakan file unduhan dari hosting pihak ketiga (umumnya arsip RAR), bukan stream yang bisa diputar langsung di pemutar. Judul ini juga tidak ditemukan pada provider lain yang mendukung streaming.</p>' +
      downloadGroupsHTML(mirrors) + '</div>';
    hostEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
