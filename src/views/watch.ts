import { API } from '../core/api';
import { progress } from '../core/client';
import { Store } from '../core/store';
import { esc, formatTime, isVideoUrl } from '../core/utils';
import { groupByQuality } from '../core/utils/qualitySorter';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { downloadGroupsHTML, footerHTML, stateHTML } from '../ui/components';
import { toast } from '../ui/toast';
import { openSheet } from '../ui/sheet';
import { go, detailHref, watchHref, type ParsedRoute } from '../core/router';
import Hls from 'hls.js';
import type { Detail, DownloadLink, Stream } from '../core/types';

const host = () => document.getElementById('view') as HTMLElement;

let saveTimer: ReturnType<typeof setInterval> | null = null;
let cur: { anime: Detail; epNum: string; eid: string; eslug: string; provider: string } | null = null;
let playerEl: HTMLVideoElement | null = null;
let lastDownloads: DownloadLink[] = [];
let lastByProvider: { provider: string; name: string; links: DownloadLink[]; error?: string }[] = [];
let lastNextHref = '';
let hls: Hls | null = null;

function destroyHls(): void {
  if (hls) {
    try { hls.destroy(); } catch { /* noop */ }
    hls = null;
  }
}

function fillHlsQuality(v: HTMLVideoElement, inst: Hls): void {
  const qsel = document.querySelector<HTMLSelectElement>('#pqsel');
  if (!qsel || !qsel.isConnected) return;
  const levels = inst.levels || [];
  if (!levels.length) return;
  const current = inst.currentLevel >= 0 ? inst.currentLevel : (inst.autoLevelEnabled && levels[inst.loadLevel] ? inst.loadLevel : -1);
  qsel.innerHTML =
    '<option value="-1">Otomatis</option>' +
    levels.map((l, i) =>
      '<option value="' + i + '"' + (i === current ? ' selected' : '') + '>' +
      (l.height ? l.height + 'p' : 'Level ' + (i + 1)) + '</option>'
    ).join('');
  const onChange = () => {
    const idx = Number(qsel.value);
    inst.currentLevel = idx;
    if (idx >= 0) v.currentTime = v.currentTime; // pertahankan posisi
    toast(idx < 0 ? 'Kualitas otomatis.' : 'Kualitas ' + (levels[idx]?.height || idx) + 'p', 'ok');
  };
  qsel.removeEventListener('change', (qsel as any).__hlsHandler || (() => {}));
  (qsel as any).__hlsHandler = onChange;
  qsel.addEventListener('change', onChange);
}

/** Pasang stream ke video: MP4 langsung, m3u8 lewat hls.js (Android WebView tak punya native HLS). */
function setupStream(v: HTMLVideoElement, url: string): void {
  destroyHls();
  if (!isVideoUrl(url)) return;
  const nativeHls = !!v.canPlayType('application/vnd.apple.mpegurl');
  if (!/\.m3u8(\?|$)/i.test(url) || nativeHls) {
    v.src = url;
    return;
  }
  if (!Hls.isSupported()) {
    v.src = url; // biarkan error handler native yang memberi pilihan embed
    return;
  }
  const inst = new Hls({
    enableWorker: true,
    manifestLoadingMaxRetry: 2,
    fragLoadingMaxRetry: 4,
    backBufferLength: 60
  });
  hls = inst;
  inst.loadSource(url);
  inst.attachMedia(v);
  inst.on(Hls.Events.MANIFEST_PARSED, () => fillHlsQuality(v, inst));
  inst.on(Hls.Events.LEVEL_SWITCHED, () => fillHlsQuality(v, inst));
  inst.on(Hls.Events.ERROR, (_ev, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) inst.startLoad();
    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) inst.recoverMediaError();
    else {
      destroyHls();
      v.dispatchEvent(new Event('error'));
    }
  });
}

function stopSaving(): void {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  destroyHls();
  playerEl = null;
  cur = null;
}

function saveNow(): void {
  if (!cur || !playerEl) return;
  const v = playerEl;
  const dur = v.duration || 0;
  const t = v.currentTime || 0;
  if (!dur) return;
  Store.saveProgress({
    id: cur.anime.id,
    slug: cur.anime.slug || cur.anime.id,
    title: cur.anime.title,
    cover: cur.anime.poster,
    ep: cur.epNum,
    provider: cur.provider,
    eid: cur.eid,
    eslug: cur.eslug,
    pct: Math.min(100, Math.round((t / dur) * 100)),
    dur: Math.round(dur),
    last: Date.now()
  });
}

function downloadSectionHTML(
  links: DownloadLink[],
  byProvider: { provider: string; name: string; links: DownloadLink[]; error?: string }[]
): string {
  const srcCount = byProvider.filter(b => b.links.length).length;
  if (!links.length) {
    return (
      '<section class="panel rv" id="wDl"><h3>' + svg('download', '', 2) + ' Unduhan</h3>' +
      '<div class="ep-empty">Belum ada tautan unduhan gabungan untuk episode ini.</div></section>'
    );
  }
  const groups = groupByQuality(links)
    .map(
      g =>
        '<div class="dl-grp"><b>' + esc(g.quality) + '</b><div class="dl-links">' +
        g.items
          .map(
            l =>
              '<a class="chip" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
              svg('download', '', 2) + esc(l.name) + '</a>'
          )
          .join('') +
        '</div></div>'
    )
    .join('');
  return (
    '<section class="panel rv" id="wDl"><h3>' + svg('download', '', 2) + ' Unduhan ' +
    '<span style="font-size:11.5px;color:var(--dim);font-weight:500">· ' + links.length + ' tautan dari ' + srcCount + ' sumber</span></h3>' +
    '<p style="font-size:12.2px;color:var(--mut);line-height:1.6;margin:2px 0 10px">Digabung otomatis dari semua portal unduhan, dirapikan per kualitas. Tautan berasal dari pihak ketiga.</p>' +
    groups + '</section>'
  );
}

function playerControlsHTML(): string {
  return (
    '<div class="pctl" id="pctl">' +
    '<button data-p="play" aria-label="Putar/Jeda">' + svg('play', '', 2.2) + '</button>' +
    '<span class="ptm" id="ptm">00:00 / 00:00</span>' +
    '<input type="range" id="pseek" class="pseek" min="0" max="1000" value="0" step="1" aria-label="Posisi pemutaran">' +
    '<select id="pqsel" class="pqsel" aria-label="Kualitas"></select>' +
    '<button data-p="mute" aria-label="Bisukan">' + svg('volume', '', 2.2) + '</button>' +
    '<button data-p="pip" aria-label="Picture in Picture">' + svg('pip', '', 2) + '</button>' +
    '<button data-p="fs" aria-label="Layar penuh">' + svg('fullscreen', '', 2) + '</button>' +
    '<button data-p="dl" aria-label="Unduhan">' + svg('download', '', 2) + '</button>' +
    '</div>'
  );
}

function bindControls(v: HTMLVideoElement, downloads: DownloadLink[], nextHref: string): void {
  playerEl = v;
  const q = <T extends Element>(s: string) => document.querySelector<T>(s);
  const playBtn = q<HTMLElement>('[data-p="play"]');
  const muteBtn = q<HTMLElement>('[data-p="mute"]');
  const pipBtn = q<HTMLElement>('[data-p="pip"]');
  const fsBtn = q<HTMLElement>('[data-p="fs"]');
  const dlBtn = q<HTMLElement>('[data-p="dl"]');
  const seek = q<HTMLInputElement>('#pseek');
  const tm = q<HTMLElement>('#ptm');
  const qsel = q<HTMLSelectElement>('#pqsel');

  const playable = downloads.filter(d => isVideoUrl(d.url));
  const hlsActive = !!hls;
  if (qsel) {
    if (hlsActive) {
      /* diisi oleh fillHlsQuality() setelah manifest HLS terbaca */
    } else if (playable.length) {
      qsel.innerHTML =
        '<option value="">Server</option>' +
        playable.map(d => '<option value="' + esc(d.url) + '">' + esc(d.quality + ' · ' + d.name) + '</option>').join('');
      qsel.addEventListener('change', () => {
        const u = qsel.value;
        if (!u) return;
        const t = v.currentTime;
        destroyHls();
        v.src = u;
        v.currentTime = t;
        v.play().catch(() => {});
        toast('Beralih ke ' + qsel.options[qsel.selectedIndex].text, 'ok');
      });
    } else {
      qsel.remove();
    }
  }

  const syncPlay = () => {
    if (playBtn) playBtn.innerHTML = v.paused ? svg('play', '', 2.2) : svg('pause', '', 2.2);
  };
  const syncTime = () => {
    if (tm) tm.textContent = formatTime(v.currentTime || 0) + ' / ' + formatTime(v.duration || 0);
    if (seek && v.duration) seek.value = String(Math.round(((v.currentTime || 0) / v.duration) * 1000));
  };

  playBtn?.addEventListener('click', () => (v.paused ? v.play().catch(() => {}) : v.pause()));
  muteBtn?.addEventListener('click', () => {
    v.muted = !v.muted;
    if (muteBtn) muteBtn.innerHTML = svg(v.muted ? 'mute' : 'volume', '', 2.2);
  });
  seek?.addEventListener('input', () => {
    if (v.duration) v.currentTime = (Number(seek.value) / 1000) * v.duration;
  });
  pipBtn?.addEventListener('click', () => {
    const doc = document as any;
    if (doc.pictureInPictureElement) doc.exitPictureInPicture().catch(() => {});
    else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => toast('Picture-in-Picture tidak didukung perangkat ini.', 'err'));
    else toast('Picture-in-Picture tidak didukung.', 'err');
  });
  fsBtn?.addEventListener('click', () => {
    const el = v.parentElement || v;
    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    } else {
      const req = (el as any).requestFullscreen || (el as any).webkitRequestFullscreen;
      if (req) req.call(el);
      try {
        (screen.orientation as any)?.lock?.('landscape').catch(() => {});
      } catch { /* noop */ }
    }
  });
  dlBtn?.addEventListener('click', () => {
    const all = downloads.length
      ? downloadGroupsHTML(downloads)
      : '<div class="ep-empty">Tidak ada link unduhan untuk episode ini.</div>';
    openSheet('Unduhan Episode', all + (cur ? '<div class="note" style="margin-top:10px">Tautan unduhan berasal dari pihak ketiga.</div>' : ''));
  });

  v.addEventListener('play', syncPlay);
  v.addEventListener('pause', () => {
    syncPlay();
    saveNow();
  });
  v.addEventListener('timeupdate', syncTime);
  v.addEventListener('loadedmetadata', syncTime);
  v.addEventListener('ended', () => {
    saveNow();
    if (Store.cfg.autoNext && nextHref) {
      toast('Berpindah ke episode berikutnya…', 'info');
      setTimeout(() => go(nextHref.replace(/^#/, '')), 900);
    }
  });
  v.addEventListener('error', () => {
    const box = document.getElementById('wHost');
    if (box && !box.querySelector('.pw .empty')) {
      box.insertAdjacentHTML(
        'beforeend',
        '<div class="banner err" style="margin-top:10px">' + svg('alert', '', 2) +
        '<span class="sp">Pemutar native gagal memuat stream ini (biasanya karena CORS atau format).</span>' +
        '<button class="btn ghost sm" data-act="use-embed">Pakai Embed</button></div>'
      );
    }
  });
  syncPlay();
  syncTime();
  attachMediaSession(v);
  if (Store.cfg.autoplay) {
    const p = v.play();
    if (p && p.catch) p.catch(() => toast('Ketuk tombol putar untuk memulai.', 'info'));
  }
}

/** Kontrol pemutar dari layar kunci/notifikasi Android (MediaSession API). */
function attachMediaSession(v: HTMLVideoElement): void {
  const nav = navigator as any;
  const ms = nav.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return;
  try {
    ms.metadata = new MediaMetadata({
      title: 'Episode ' + (cur?.epNum || '') + ' · ' + (cur?.anime.title || ''),
      artist: 'Nanime',
      album: cur?.anime.title || '',
      artwork: cur?.anime.poster ? [{ src: cur.anime.poster, sizes: '512x512', type: 'image/jpeg' }] : []
    });
    ms.setActionHandler('play', () => v.play().catch(() => {}));
    ms.setActionHandler('pause', () => v.pause());
    ms.setActionHandler('seekbackward', () => { v.currentTime = Math.max(0, (v.currentTime || 0) - 10); });
    ms.setActionHandler('seekforward', () => { v.currentTime = Math.min(v.duration || 0, (v.currentTime || 0) + 10); });
    const syncState = () => { try { ms.playbackState = v.paused ? 'paused' : 'playing'; } catch { /* noop */ } };
    v.addEventListener('play', syncState);
    v.addEventListener('pause', syncState);
    v.addEventListener('ended', () => { try { ms.playbackState = 'none'; } catch { /* noop */ } });
    syncState();
  } catch { /* noop — perangkat tanpa dukungan MediaSession */ }
}

export function useEmbedFallback(): void {
  const box = document.getElementById('wHost');
  if (!box || !cur) return;
  const url = (cur as any).embedUrl || '';
  if (!url) return;
  destroyHls();
  box.innerHTML =
    '<div class="pw"><iframe id="playerFrame" src="' + esc(url) +
    '" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" loading="eager" referrerpolicy="no-referrer"></iframe></div>';
}

export async function ViewWatch(r: ParsedRoute): Promise<void> {
  stopSaving();
  const param = r.parts[1] || '';
  const epNum = r.parts[2] || '1';
  const provider = r.q.provider || Store.getProvider();
  const eid = r.q.eid || '';
  const eslug = r.q.eslug || '';

  host().innerHTML =
    '<div class="shell" style="padding-top:16px"><div id="wHost"><div class="sk" style="aspect-ratio:16/9;border-radius:var(--r3);width:100%"></div></div>' +
    '<div id="wInfo" style="margin-top:16px"></div>' +
    '<div id="wDlWrap" style="margin-top:16px"></div></div>';

  let anime: Detail;
  try {
    anime = await API.detail(provider, param, eslug);
  } catch (e: any) {
    const notFound = e && e.status === 404;
    host().innerHTML =
      '<div class="shell">' +
      stateHTML(
        notFound ? 'empty' : 'err',
        notFound ? 'Anime Tidak Ditemukan' : 'Gagal memuat anime',
        notFound ? 'Judul ini belum tersedia. Coba cari ulang dari beranda.' : e.message || '',
        '<div style="display:flex;gap:9px;flex-wrap:wrap;justify-content:center">' +
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Coba lagi</button>' +
        '<a class="btn ghost" href="#/home">Beranda</a></div>'
      ) + '</div>';
    return;
  }

  const epList = anime.episodeList || [];
  const epIdx = epList.findIndex(e => String(e.num) === String(epNum));
  const ep = epIdx > -1 ? epList[epIdx] : null;
  const prevEp = epIdx > 0 ? epList[epIdx - 1] : null;
  const nextEp = epIdx > -1 && epIdx < epList.length - 1 ? epList[epIdx + 1] : null;
  const eidUse = eid || (ep && ep.id ? String(ep.id) : '') || epNum;
  const eslugUse = eslug || (ep && ep.slug ? String(ep.slug) : '') || '';
  const favW = Store.isFav(anime.id, anime.provider);
  const detLink = detailHref(anime.id, provider, anime.slug || '');
  const nextHref = nextEp
    ? watchHref(anime.id, provider, nextEp.num, nextEp.id || nextEp.num, nextEp.slug || '', anime.slug)
    : '';

  const info = document.getElementById('wInfo');
  if (info) {
    info.innerHTML =
      '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px">' +
      '<a href="' + detLink + '" class="link-more" style="margin-bottom:8px">' + svg('back', '', 2.4) + ' ' + esc(anime.title) + '</a>' +
      '<h1 style="font-size:clamp(19px,4vw,26px);font-weight:740;margin-top:6px">Episode ' + esc(epNum) + '</h1>' +
      '<div class="stats" style="margin-top:10px"><span class="stat">' + svg('film', '', 1.9) + ' <b>' + esc(epNum) + '</b></span>' +
      (anime.type ? '<span class="stat">' + esc(anime.type) + '</span>' : '') + '</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn' + (favW ? ' danger' : ' ghost') + ' sm" data-fav="' + esc(anime.id) + '" data-provider="' + esc(anime.provider) +
        '" data-cover="' + esc(anime.poster) + '" data-title="' + esc(anime.title) + '" data-score="' + esc(anime.score || '') +
        '" data-type="' + esc(anime.type || '') + '" data-slug="' + esc(anime.slug || '') + '" aria-pressed="' + favW + '">' +
        svg('heart', '', 2.1) + (favW ? ' Tersimpan' : ' Favorit') + '</button>' +
      '<button class="btn ghost sm" data-act="share-watch">' + svg('share', '', 2) + ' Bagikan</button>' +
      '<a class="btn ghost sm" href="' + detLink + '">' + svg('film', '', 2) + ' Episode</a>' +
      '</div></div>' +
      '<div id="wEpNav" style="display:flex;gap:9px;margin-top:18px;flex-wrap:wrap">' +
      (prevEp
        ? '<a class="btn ghost" href="' + watchHref(anime.id, provider, prevEp.num, prevEp.id || prevEp.num, prevEp.slug || '', anime.slug) + '">' +
          svg('left', '', 2.2) + ' EP ' + esc(prevEp.num) + '</a>'
        : '') +
      (nextEp ? '<a class="btn primary" href="' + nextHref + '">EP ' + esc(nextEp.num) + ' ' + svg('right', '', 2.2) + '</a>' : '') +
      '<button class="btn ghost sm" data-act="open-queue">' + svg('layers', '', 2) + ' Daftar Episode</button>' +
      '</div>';
  }

  cur = { anime, epNum, eid: eidUse, eslug: eslugUse, provider };
  (cur as any).embedUrl = '';

  try {
    progress(true, 45);
    /* Fallback otomatis: coba sumber berurutan sampai ada yang bisa memutar. */
    const resolved = await API.streamWithFallback(provider, {
      episodeId: eidUse,
      episodeSlug: eslugUse || epNum,
      episode: epNum,
      animeId: anime.id,
      animeSlug: anime.slug || ''
    });
    const stream = resolved as Stream & { downloads: DownloadLink[]; info: any; note?: string };
    progress(true, 100);
    setTimeout(() => progress(false), 240);

    const resolvedProvider = resolved.resolvedProvider || provider;

    /* Unduhan digabung dari semua portal unduhan dengan resolusi judul+episode. */
    let downloads: DownloadLink[] = stream.downloads || [];
    let byProvider: { provider: string; name: string; links: DownloadLink[]; error?: string }[] = [];
    try {
      const agg = await API.aggregateDownloads(resolvedProvider, {
        title: anime.title,
        episode: epNum,
        episodeId: eidUse,
        episodeSlug: eslugUse,
        animeId: anime.id,
        animeSlug: anime.slug || ''
      });
      byProvider = agg.byProvider;
      if (agg.links.length) downloads = agg.links;
    } catch {
      /* biarkan unduhan dari provider tunggal bila agregasi gagal */
    }

    lastDownloads = downloads;
    lastByProvider = byProvider;
    lastNextHref = nextHref;
    const playerUrl = stream.playerUrl || '';
    (cur as any).embedUrl = playerUrl;
    cur.provider = resolvedProvider;
    const native = isVideoUrl(playerUrl);
    const box = document.getElementById('wHost');
    const dlWrap = document.getElementById('wDlWrap');
    if (dlWrap) {
      dlWrap.innerHTML = downloadSectionHTML(downloads, byProvider);
      initView(dlWrap);
    }
    if (resolved.fallbackNote) {
      const infoEl = document.getElementById('wInfo');
      if (infoEl) {
        infoEl.insertAdjacentHTML(
          'afterbegin',
          '<div class="banner" style="margin-bottom:12px">' + svg('info', '', 2) +
          '<span class="sp">' + esc(resolved.fallbackNote) + '</span></div>'
        );
      }
    }

    if (box) {
      if (native) {
        box.innerHTML =
          '<div class="pw native"><video id="player" playsinline preload="metadata" crossorigin="anonymous" ' +
          'poster="' + esc(anime.poster) + '"></video>' + playerControlsHTML() + '</div>';
        const v = document.getElementById('player') as HTMLVideoElement;
        setupStream(v, playerUrl);
        bindControls(v, downloads, nextHref);
      } else if (playerUrl) {
        box.innerHTML =
          '<div class="pw"><iframe id="playerFrame" src="' + esc(playerUrl) +
          '" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" loading="eager" referrerpolicy="no-referrer"></iframe></div>' +
          (downloads.filter(d => isVideoUrl(d.url)).length
            ? '<div class="banner" style="margin-top:10px">' + svg('info', '', 2) +
              '<span class="sp">Server ini memakai embed. Pilih server MP4 di bawah untuk pemutar native.</span>' +
              '<button class="btn ghost sm" data-act="use-native">Pakai MP4</button></div>'
            : '');
      } else {
        box.innerHTML =
          '<div class="pw"><div class="empty"><div>' + svg('server', '', 1.7) +
          '<strong>Stream tidak tersedia</strong><p style="font-size:12.8px;max-width:44ch;line-height:1.62">' +
          esc(
            stream.servers && stream.servers.length
              ? 'Sumber ini tidak menyediakan URL pemutar untuk episode ini. Coba pilih server alternatif di bawah.'
              : stream.note || 'Sumber ini tidak menyediakan URL pemutar untuk episode ini.'
          ) + '</p></div></div></div>';
      }
    }

    const hasSrv = !!(stream.servers && stream.servers.length);
    const infoEl = document.getElementById('wInfo');
    if (hasSrv && infoEl) {
      const favQ = Store.cfg.defaultQuality;
      const ordered = [...stream.servers].sort((a, b) => {
        if (a.def !== b.def) return a.def ? -1 : 1;
        if (favQ) {
          const pa = (a.quality || '').indexOf(favQ) > -1 ? 1 : 0;
          const pb = (b.quality || '').indexOf(favQ) > -1 ? 1 : 0;
          if (pa !== pb) return pb - pa;
        }
        return 0;
      });
      infoEl.insertAdjacentHTML(
        'beforeend',
        '<div style="margin-top:16px"><div style="font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim);font-weight:700;margin-bottom:9px">Pilih Server Streaming</div>' +
        '<div class="srv" id="srvRow">' +
        ordered
          .map(
            (s, i) =>
              '<button class="srv-btn' + (i === 0 ? ' on' : '') + '" data-server-id="' + esc(s.id) + '" data-quality="' + esc(s.quality || '') + '">' +
              svg('server', '', 2) + esc(s.name) +
              (s.quality ? ' <span style="font-size:10px;opacity:.7">(' + esc(s.quality) + ')</span>' : '') + '</button>'
          )
          .join('') +
        '</div></div>'
      );
      document.querySelectorAll<HTMLElement>('.srv-btn').forEach(b => {
        b.addEventListener('click', async () => {
          const serverId = b.getAttribute('data-server-id') || '';
          if (!serverId) {
            toast('Server ID kosong.', 'err');
            return;
          }
          const label = b.innerHTML;
          b.textContent = 'Memuat…';
          (b as HTMLButtonElement).disabled = true;
          try {
            const url = await API.resolveServer(serverId, provider);
            if (!url) throw new Error('URL kosong.');
            (cur as any).embedUrl = url;
            const iframe = document.getElementById('playerFrame') as HTMLIFrameElement | null;
            if (iframe) iframe.src = url;
            else {
              if (isVideoUrl(url)) {
                useNativeUrl(url);
              } else {
                useEmbedFallback();
              }
            }
            document.querySelectorAll('.srv-btn').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            toast('Server aktif.', 'ok');
          } catch (e: any) {
            toast(e.message || 'Gagal memuat server.', 'err');
          } finally {
            (b as HTMLButtonElement).disabled = false;
            b.innerHTML = label;
          }
        });
      });
    } else if (!playerUrl && infoEl) {
      infoEl.insertAdjacentHTML(
        'beforeend',
        '<div class="banner err" style="margin-top:14px">' + svg('alert', '', 2) +
        '<span class="sp"><b>Tidak ada stream untuk episode ini.</b> ' + esc(stream.note || 'Sumber ini tidak menyediakan URL pemutar maupun server alternatif.') +
        ' Coba episode lain dari daftar di halaman detail.</span>' +
        '<a class="btn ghost sm" href="' + detLink + '">' + svg('film', '', 2) + ' Daftar EP</a></div>'
      );
    }

    Store.addHist({
      id: anime.id,
      slug: anime.slug || anime.id,
      title: anime.title,
      cover: anime.poster,
      ep: epNum,
      provider,
      eid: eidUse,
      eslug: eslugUse,
      t: 0,
      dur: 0
    });

    saveTimer = setInterval(saveNow, 10000);
    window.addEventListener('beforeunload', saveNow, { once: true });
  } catch (e: any) {
    progress(false);
    const box = document.getElementById('wHost');
    if (box) {
      box.innerHTML =
        '<div class="pw"><div class="empty"><div>' + svg('alert', '', 1.7) + '<strong>Stream gagal dimuat</strong>' +
        '<p style="font-size:12.8px;max-width:44ch;line-height:1.62">' + esc(e.message || 'Tidak ada sumber.') + '</p>' +
        '<div style="display:flex;gap:9px;flex-wrap:wrap;justify-content:center;margin-top:14px">' +
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Coba lagi</button>' +
        '<a class="btn ghost" href="' + detailHref(anime.id, provider, anime.slug || '') + '">Kembali</a></div></div></div></div>';
    }
  }
}

function useNativeUrl(url: string): void {
  const box = document.getElementById('wHost');
  if (!box) return;
  const downloads: DownloadLink[] = lastDownloads;
  const v0 = document.getElementById('player') as HTMLVideoElement | null;
  const t = v0 ? v0.currentTime : 0;
  destroyHls();
  box.innerHTML =
    '<div class="pw native"><video id="player" playsinline preload="metadata"></video>' +
    playerControlsHTML() + '</div>';
  const v = document.getElementById('player') as HTMLVideoElement;
  setupStream(v, url);
  bindControls(v, downloads, lastNextHref);
  const resume = () => {
    if (t > 0) v.currentTime = t;
    v.play().catch(() => {});
  };
  if (v.readyState >= 1) resume();
  else v.addEventListener('loadedmetadata', resume, { once: true });
}

export function openQueue(): void {
  if (!cur) return;
  const list = cur.anime.episodeList || [];
  if (!list.length) {
    toast('Daftar episode tidak tersedia untuk judul ini.', 'err');
    return;
  }
  openSheet(
    'Daftar Episode · ' + cur.anime.title,
    '<div class="ep-grid" style="max-height:52dvh;overflow:auto">' +
      list
        .map((e, i) =>
          '<button class="ep' + (String(e.num) === String(cur!.epNum) ? ' done' : '') + '" data-ep-idx="' + i + '">' +
          '<span class="no">' + esc(e.num) + '</span><span class="tx"><b>Episode ' + esc(e.num) + '</b><span>' +
          esc(e.date || '') + '</span></span><span class="go">' + svg('play', '', 2.2) + '</span></button>'
        )
        .join('') +
      '</div>'
  );
  document.querySelectorAll<HTMLElement>('#sheet-root [data-ep-idx]').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.getAttribute('data-ep-idx')!;
      const e = list[i];
      if (!e || !cur) return;
      go('/watch/' + encodeURIComponent(cur.anime.id) + '/' + encodeURIComponent(e.num) + '?provider=' + encodeURIComponent(cur.provider) + '&eid=' + encodeURIComponent(e.id || e.num) + '&eslug=' + encodeURIComponent(e.slug || ''));
    });
  });
}

export const WatchActions = {
  openQueue,
  useEmbed: useEmbedFallback,
  useNative: () => {
    const box = document.getElementById('wHost');
    if (box) box.innerHTML = '<div class="sk" style="aspect-ratio:16/9;border-radius:var(--r3);width:100%"></div>';
    const url = cur ? (cur as any).embedUrl : '';
    if (url) useNativeUrl(url);
  },
  share: () => {
    if (!cur) return;
    const url = location.href;
    const data = { title: cur.anime.title + ' — Episode ' + cur.epNum, url };
    if (navigator.share) navigator.share(data).catch(() => {});
    else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast('Tautan disalin ke papan klip.', 'ok'),
        () => toast('Gagal menyalin tautan.', 'err')
      );
    } else toast(url, 'info', 'Tautan');
  }
};

export const WatchState = {
  get current() {
    return cur;
  }
};
