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
import { fetchMeta, resolveMeta } from '../metadata';
import type { MatchResult } from '../metadata';
import type { AnimeMeta, Detail, DownloadLink, EpisodeItem } from '../core/types';

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
  return (
    '<section class="panel rv" id="dlPanel"><h3>' + svg('download', '', 2) + ' Unduhan ' +
    '<span style="font-size:11.5px;color:var(--dim);font-weight:500" id="dlCount"></span></h3>' +
    '<p style="font-size:12.2px;color:var(--mut);line-height:1.6;margin:2px 0 10px">Digabung otomatis dari semua portal unduhan, dirapikan per kualitas.</p>' +
    '<div id="dlBody">' +
    (downloads.length
      ? downloadGroupsHTML(downloads)
      : '<div class="ep-empty">Memuat tautan unduhan gabungan…</div>') +
    '</div>' +
    '<div id="dlSrc"></div>' +
    (hasBatch
      ? '<div style="margin-top:12px"><button class="btn ghost sm" data-act="load-batch">' + svg('layers', '', 2) + ' Muat Unduhan Batch</button></div>'
      : '') +
    '</section>'
  );
}

/** Gabungkan unduhan tingkat-seri dari semua portal berdasarkan judul. */
async function enrichDownloads(anime: Detail): Promise<void> {
  const body = document.getElementById('dlBody');
  if (!body) return;
  try {
    const agg = await API.aggregateDownloads(anime.provider, {
      title: anime.title,
      animeId: anime.id,
      animeSlug: anime.slug || ''
    });
    if (!document.body.contains(body)) return;
    const seen = new Set<string>();
    const merged = [...(anime.downloads || []), ...agg.links].filter(l => {
      if (!l.url || seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
    if (merged.length) renderDownloadBody(merged);
    const count = document.getElementById('dlCount');
    if (count) count.textContent = merged.length ? '· ' + merged.length + ' tautan' : '';
  } catch {
    /* biarkan unduhan provider tunggal bila agregasi gagal */
  }
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
  const title = r.q.title || '';
  DetailState.det = null;
  DetailState.ep = [];

  host().innerHTML = '<div class="shell"><div style="height:280px;border-radius:var(--r3);margin-top:18px" class="sk"></div></div>';

  try {
    progress(true, 30);
    const anime = await API.detailSmart(provider, param, r.q.slug || '', title);
    progress(true, 100);
    setTimeout(() => progress(false), 260);
    renderDetail(anime);
  } catch (e: any) {
    progress(false);
    const notFound = e && e.status === 404;
    const msg = notFound
      ? 'Judul ini belum tersedia. Coba cari ulang dari beranda atau gunakan pencarian.'
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

function searchHref(title: string): string {
  return '#/search?q=' + encodeURIComponent(title);
}

function metaPanelHTML(meta: AnimeMeta, score: number): string {
  const src = meta.source === 'kitsu' ? 'Kitsu' : 'AniList';
  const pct = Math.round(score * 100);
  const badge = score >= 0.999 ? 'Tautan cocok' : 'Cocok ' + pct + '%';
  const stats =
    (meta.score ? '<span class="stat">' + svg('star', '', 1.8) + ' <b>' + esc(String(meta.score)) + '</b></span>' : '') +
    (meta.format ? '<span class="stat">' + svg('film', '', 1.9) + ' <b>' + esc(meta.format) + '</b></span>' : '') +
    (meta.episodes ? '<span class="stat">' + svg('film', '', 1.9) + ' <b>' + esc(String(meta.episodes)) + '</b> Eps</span>' : '') +
    (meta.seasonYear ? '<span class="stat">' + svg('cal', '', 1.9) + ' <b>' + esc(String(meta.seasonYear)) + '</b></span>' : '') +
    (meta.duration ? '<span class="stat">' + svg('clock', '', 1.9) + ' <b>' + esc(String(meta.duration)) + 'm</b></span>' : '') +
    (meta.studios.length ? '<span class="stat">' + svg('compass', '', 1.9) + ' <b>' + esc(meta.studios.map(s => s.name).join(', ')) + '</b></span>' : '');
  const genres = meta.genres.length
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      meta.genres.map(g => '<span class="chip">' + esc(g) + '</span>').join('') + '</div>'
    : '';
  const synopsis =
    meta.synopsis && !(DetailState.det && DetailState.det.synopsis)
      ? '<div class="syn clip" id="metaSyn" style="margin-top:12px">' + esc(meta.synopsis) + '</div>' +
        (meta.synopsis.length > 340 ? '<button class="readmore" data-act="toggle-metasyn">Baca selengkapnya ' + svg('down', '', 2.4) + '</button>' : '')
      : '';
  const relations = meta.relations.length
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      meta.relations.map(r =>
        '<a class="chip" href="' + searchHref(r.title) + '" title="' + esc(r.relationType) + '">' +
        esc(r.title) + (r.relationType && r.relationType !== 'SEQUEL' && r.relationType !== 'PREQUEL' ? '' : ' · ' + esc(r.relationType === 'SEQUEL' ? 'sequel' : 'prequel')) +
        '</a>'
      ).join('') + '</div>'
    : '';
  const chars = meta.characters.length
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      meta.characters.slice(0, 8).map(c =>
        '<span class="chip">' + esc(c.name) + (c.role && c.role !== 'MAIN' ? ' <i style="opacity:.6;font-style:normal">· ' + esc(c.role.toLowerCase()) + '</i>' : '') + '</span>'
      ).join('') + '</div>'
    : '';
  const recs = meta.recommendations.length
    ? '<div class="grid wide" style="margin-top:14px">' +
      meta.recommendations.slice(0, 8).map((r, i) =>
        '<div class="rv-s" style="--d:' + ((i % 8) * 30) + 'ms"><a class="card g" href="' + searchHref(r.title) + '" aria-label="' + esc(r.title) + '">' +
        '<div class="poster"><span class="perr">' + svg('film', '', 1.7) + '</span>' +
        '<img data-src="' + esc(r.cover || '') + '" alt="' + esc(r.title) + '" loading="lazy" onload="this.classList.add(\'ld\')" onerror="this.style.display=\'none\'">' +
        '<div class="veil"></div><span class="badge">Katalog</span>' +
        (r.score ? '<span class="badge score">' + svg('star', '', 1.8) + ' ' + esc(String(r.score)) + '</span>' : '') + '</div>' +
        '<div class="body"><div class="nm">' + esc(r.title) + '</div>' +
        '<div class="meta">' + [r.format, r.year ? String(r.year) : ''].filter(Boolean).map(esc).join('<i></i>') + '</div></div></a></div>'
      ).join('') + '</div>'
    : '';

  return (
    '<section class="panel rv" id="metaPanel"><h3>' + svg('info', '', 2) + ' Info Katalog ' +
    '<span class="badge" style="position:static;vertical-align:middle;margin-left:6px">' + esc(src) + ' · ' + esc(badge) + '</span></h3>' +
    '<div class="stats">' + (stats || '') + '</div>' +
    genres + synopsis + (relations
      ? '<div style="margin-top:14px;font-size:12.4px;color:var(--dim)">Terkait</div>' + relations
      : '') +
    (chars
      ? '<div style="margin-top:12px;font-size:12.4px;color:var(--dim)">Karakter utama</div>' + chars
      : '') +
    (recs
      ? '<div style="margin-top:14px;font-size:12.4px;color:var(--dim)">Rekomendasi serupa</div>' + recs
      : '') +
    '</section>'
  );
}

function metaSuggestHTML(res: MatchResult): string {
  return (
    '<section class="panel rv" id="metaPanel"><h3>' + svg('info', '', 2) + ' Info Katalog</h3>' +
    '<p style="font-size:13px;line-height:1.6;color:var(--mut);margin:4px 0 12px">Kecocokan judul dengan katalog ' +
    '<b>' + esc(res.meta.title) + '</b> terbatas (skor ' + Math.round(res.score * 100) + '%), jadi tidak digabung otomatis. ' +
    'Kamu boleh menggabungkannya secara manual.</p>' +
    '<button class="btn ghost sm" data-act="meta-confirm" data-id="' + esc(String(res.meta.id)) +
    '" data-source="' + esc(res.meta.source) + '">' + svg('layers', '', 2) + ' Gabungkan info katalog</button>' +
    '</section>'
  );
}

/** Isi slot #metaSlot dengan metadata AniList/Kitsu (tanpa memperlambat render detail). */
async function enrichDetail(): Promise<void> {
  const slot = document.getElementById('metaSlot');
  const det = DetailState.det;
  if (!slot || !det || !det.title || slot.dataset.busy === '1') return;
  slot.dataset.busy = '1';
  const confirmed = slot.dataset.confirmed === '1';
  try {
    const res = await resolveMeta(det.title);
    if (!slot.isConnected) return;
    if (!res) {
      slot.innerHTML = '';
      slot.dataset.busy = '';
      return;
    }
    if (!res.auto && !confirmed) {
      slot.innerHTML = metaSuggestHTML(res);
      slot.dataset.busy = '';
      initView(slot);
      const btn = slot.querySelector<HTMLButtonElement>('[data-act="meta-confirm"]');
      if (btn) {
        btn.addEventListener('click', () => {
          slot.dataset.confirmed = '1';
          slot.innerHTML = '<section class="panel"><div style="display:flex;gap:10px;align-items:center;color:var(--mut);font-size:13px">' +
            svg('refresh', '', 2) + ' Mengambil info katalog…</div></section>';
          void enrichDetail();
        });
      }
      return;
    }
    const meta = await fetchMeta(res.meta.id, res.meta.source);
    if (!slot.isConnected) return;
    slot.innerHTML = metaPanelHTML(meta, res.score);
    slot.dataset.busy = '';
    initView(slot);
  } catch (e) {
    console.warn('Metadata katalog gagal dimuat:', e);
    if (slot.isConnected) {
      slot.innerHTML = '';
      slot.dataset.busy = '';
    }
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

  const synSec =
    '<section class="panel rv"><h3>' + svg('info', '', 2) + ' Sinopsis</h3><div class="syn clip" id="syn">' +
    esc(anime.synopsis || 'Sinopsis tidak tersedia.') + '</div>' +
    ((anime.synopsis || '').length > 340
      ? '<button class="readmore" data-act="toggle-syn">Baca selengkapnya ' + svg('down', '', 2.4) + '</button>'
      : '') +
    '</section>';

  const dlPanel = downloadPanel(anime.downloads || [], anime.batchId);

  const epPanel =
    '<section class="panel rv" id="epPanel"><h3>' + svg('film', '', 2) + ' Daftar Episode <span style="font-size:11.5px;color:var(--dim);font-weight:500">· ' +
    EP.length + ' entri</span></h3>' +
    (EP.length
      ? '<div class="ep-grid" style="max-height:520px;overflow:auto">' +
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
      : '<div class="ep-empty">Daftar episode tidak tersedia untuk judul ini.</div>') +
    '</section>';

  const tabs: { id: string; label: string; on?: boolean; disabled?: boolean }[] = [
    { id: 'detail', label: 'Detail', on: true },
    { id: 'episode', label: 'Episode' + (EP.length ? ' (' + EP.length + ')' : '') },
    { id: 'download', label: 'Download', disabled: !dlPanel }
  ];

  host().innerHTML =
    '<div class="detail-hero">' +
    (anime.poster ? '<div class="bd" style="background-image:url(\'' + esc(anime.poster) + '\')"></div>' : '') +
    '<div class="shell"><div class="detail-in">' +
    '<div class="cover-box"><div class="in"><img src="' + esc(anime.poster) + '" alt="Poster ' + esc(anime.title) + '" loading="eager"></div></div>' +
    '<div class="detail-meta">' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">' +
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
    '<div class="shell detail-tabs">' +
    '<div id="movieStream" style="display:none"></div>' +
    '<div class="dtabs" role="tablist">' +
    tabs.map(t =>
      '<button class="dtab' + (t.on ? ' on' : '') + '" data-dtab="' + t.id + '" role="tab"' +
      (t.on ? ' aria-selected="true"' : '') + (t.disabled ? ' disabled' : '') + '>' + esc(t.label) + '</button>'
    ).join('') +
    '</div>' +
    '<div class="dpanel on" id="dtDetail" data-panel="detail">' +
    synSec + personalPanel(anime.id) + genreSec + '<div id="metaSlot" data-busy=""></div>' + recSec +
    '</div>' +
    '<div class="dpanel" id="dtEpisode" data-panel="episode">' + epPanel + '</div>' +
    '<div class="dpanel" id="dtDownload" data-panel="download">' + (dlPanel || '<section class="panel"><div class="ep-empty">Tautan unduhan tidak tersedia untuk judul ini.</div></section>') + '</div>' +
    footerHTML() + '</div>';

  initView(host());

  host().querySelectorAll<HTMLElement>('.dtab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('disabled')) return;
      const id = btn.getAttribute('data-dtab') || 'detail';
      host().querySelectorAll<HTMLElement>('.dtab').forEach(b => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      host().querySelectorAll<HTMLElement>('.dpanel').forEach(p => {
        p.classList.toggle('on', p.getAttribute('data-panel') === id);
      });
    });
  });

  host().querySelectorAll<HTMLElement>('[data-ep-idx]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = +b.getAttribute('data-ep-idx')!;
      const ep = EP[idx];
      if (ep) go('/watch/' + encodeURIComponent(anime.id) + '/' + encodeURIComponent(ep.num) + '?provider=' + encodeURIComponent(anime.provider) + '&eid=' + encodeURIComponent(ep.id) + '&eslug=' + encodeURIComponent(ep.slug || ''));
    });
  });

  void enrichDetail();
  void enrichDownloads(anime);
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
    toast('Sumber video ditemukan.', 'ok');
    go('/watch/' + encodeURIComponent(res.id) + '/' + encodeURIComponent(res.epNum) + '?provider=' + encodeURIComponent(res.provider) + '&eid=' + encodeURIComponent(res.eid || res.epNum) + '&eslug=' + encodeURIComponent(res.eslug || ''));
    return;
  }
  if (hostEl) {
    const mirrors = Array.isArray(DET.downloads) ? DET.downloads : [];
    hostEl.innerHTML =
      '<div class="panel"><h3>' + svg('alert', '', 2) + ' Tidak ada sumber video yang dapat diputar</h3>' +
      '<p style="color:var(--mut);font-size:13px;line-height:1.65;margin:8px 0 0">Judul film ini hanya menyediakan berkas unduhan dari hosting pihak ketiga (umumnya arsip RAR), bukan stream yang bisa diputar langsung di pemutar. Tidak ada sumber streaming lain yang cocok untuk judul ini.</p>' +
      downloadGroupsHTML(mirrors) + '</div>';
    hostEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
