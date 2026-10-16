import { PROVIDERS } from '../core/config';
import { Store } from '../core/store';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import type { Card, DownloadLink } from '../core/types';

export function cardHTML(a: Card, opt?: { g?: boolean }): string {
  const o = opt || {};
  const f = Store.isFav(a.id, a.provider);
  const meta = [a.epLabel, a.sub, a.type].filter(Boolean);
  const prov = (PROVIDERS[a.provider] && PROVIDERS[a.provider].name) || a.provider || '';

  return (
    '<a class="card' + (o.g ? ' g' : '') + '" href="#/anime/' + encodeURIComponent(a.id) +
      '?provider=' + encodeURIComponent(a.provider) + (a.slug ? '&slug=' + encodeURIComponent(a.slug) : '') +
      '" data-card="' + esc(a.id) + '" data-provider="' + esc(a.provider) + '" aria-label="' + esc(a.title) + '">' +
    '<div class="poster">' +
    '<span class="perr" aria-hidden="true">' + svg('film', '', 1.7) + '</span>' +
    '<img data-src="' + esc(a.poster) + '" alt="' + esc(a.title) + '" loading="lazy" onload="this.classList.add(\'ld\')" onerror="this.style.display=\'none\'">' +
    '<div class="veil"></div>' +
    '<span class="badge">' + esc(prov) + '</span>' +
    (a.score ? '<span class="badge score">' + svg('star', '', 1.8) + ' ' + esc(a.score) + '</span>' : '') +
    '<div class="play-ov"><span class="cir">' + svg('play') + '</span></div>' +
    '</div>' +
    '<div class="body"><div class="nm">' + esc(a.title) + '</div>' +
    '<div class="meta">' + meta.map(esc).join('<i></i>') + '</div></div>' +
    '<button class="fav-btn' + (f ? ' on' : '') + '" data-fav="' + esc(a.id) + '" data-provider="' + esc(a.provider) +
      '" data-cover="' + esc(a.poster) + '" data-title="' + esc(a.title) + '" data-score="' + esc(a.score || '') +
      '" data-epl="' + esc(a.epLabel || '') + '" data-sub="' + esc(a.sub || '') + '" data-type="' + esc(a.type || '') +
      '" data-slug="' + esc(a.slug || '') + '" aria-label="Favorit" aria-pressed="' + f + '">' + svg('heart', '', 2.1) + '</button>' +
    '</a>'
  );
}

export function skCards(n: number, g?: boolean): string {
  let s = '';
  for (let i = 0; i < n; i++) s += '<div class="sk sk-card' + (g ? ' g' : '') + '" style="--d:' + (i * 45) + 'ms"></div>';
  return s;
}

export function secHead(title: string, sub?: string, rail?: string, more?: string): string {
  return (
    '<div class="sec-head rv"><div class="t"><h2><span class="bar"></span>' + esc(title) + '</h2>' +
    (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
    (more ? '<a class="link-more" href="' + more + '">Lihat semua ' + svg('right', '', 2.2) + '</a>' : '') +
    (rail
      ? '<div style="display:flex;gap:7px"><button class="arw" data-rail="' + rail + '" data-dir="-1" aria-label="Geser kiri">' +
        svg('left', '', 2.2) + '</button><button class="arw" data-rail="' + rail + '" data-dir="1" aria-label="Geser kanan">' +
        svg('right', '', 2.2) + '</button></div>'
      : '') +
    '</div>'
  );
}

export function stateHTML(kind: string, title: string, msg: string, act?: string): string {
  const ic = ({ err: 'alert', empty: 'compass', search: 'search', net: 'globe', stream: 'server' } as Record<string, string>)[kind] || 'info';
  return (
    '<div class="state rv in"><div class="ic">' + svg(ic, '', 1.7) + '</div><h3>' + esc(title) + '</h3><p>' +
    esc(msg) + '</p>' + (act || '') + '</div>'
  );
}

export function footerHTML(): string {
  return (
    '<footer class="ft"><span class="lg"><img src="logo.jpg" alt="" width="22" height="22">' +
    '<b style="color:var(--mut);font-weight:600">Nanime</b> · Premium Anime Streaming</span>' +
    '<span>Client-side · Tanpa backend · Multi-sumber otomatis</span>' +
    '<span class="cr">Made By Nata, using third-party APIs. This client scrapes and aggregates anime metadata and stream links from third-party public sources (e.g. Otakudesu, Oploverz, Kuramanime, Kusonime) for personal use only. It hosts no video files on its own servers; all titles, artwork, subtitles and streams belong to their respective owners and uploaders. Nanime is not affiliated with, endorsed by, or responsible for any of those sites — if you enjoy a series, please support the official release.</span></footer>'
  );
}

export function railItems(list: Card[]): string {
  return list.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms">' + cardHTML(a) + '</div>').join('');
}

export function gridItems(list: Card[], delay = 36): string {
  return list.map((a, i) => '<div class="rv-s" style="--d:' + ((i % 8) * delay) + 'ms">' + cardHTML(a, { g: true }) + '</div>').join('');
}

export function dropRailArrows(sel: string): void {
  const sec = document.querySelector(sel);
  if (!sec) return;
  const head = sec.querySelector('.sec-head');
  if (!head) return;
  const btn = head.querySelector('[data-rail]');
  if (btn && btn.parentElement) btn.parentElement.remove();
}

export function sectionHTML(id: string, title: string, sub: string, rail?: string, more?: string): string {
  return (
    '<section class="sec" id="' + id + '">' + secHead(title, sub, rail, more) +
    '<div class="rail" data-railwrap="' + (rail || '') + 'w"><div class="rail-track" id="' + (rail || id) + '">' +
    skCards(10) + '</div></div></section>'
  );
}

export function downloadGroupsHTML(links: DownloadLink[]): string {
  if (!links || !links.length) return '';
  const byQ: Record<string, DownloadLink[]> = {};
  links.forEach(l => {
    (byQ[l.quality] = byQ[l.quality] || []).push(l);
  });
  return Object.keys(byQ)
    .map(
      q =>
        '<div class="dl-grp"><b>' + esc(q) + '</b><div class="dl-links">' +
        byQ[q]
          .map(
            l =>
              '<a class="chip" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
              svg('download', '', 2) + esc(l.name) + '</a>'
          )
          .join('') +
        '</div></div>'
    )
    .join('');
}
