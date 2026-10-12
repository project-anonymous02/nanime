import { PROVIDERS } from '../core/config';
import { Store, storageSize } from '../core/store';
import { formatDuration, relTime, esc } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { footerHTML, stateHTML } from '../ui/components';
import { detailHref, watchHref, type ParsedRoute } from '../core/router';

const host = () => document.getElementById('view') as HTMLElement;

function hbar(rows: { n: string; v: number }[], suffix = ''): string {
  const max = Math.max(1, ...rows.map(r => r.v));
  return (
    '<div class="hbar">' +
    rows
      .map(
        r =>
          '<div class="row"><span class="nm">' + esc(r.n) + '</span>' +
          '<span class="tr"><i style="width:' + Math.round((r.v / max) * 100) + '%"></i></span>' +
          '<span class="vl">' + r.v + suffix + '</span></div>'
      )
      .join('') +
    '</div>'
  );
}

function topTitles(limit: number): { n: string; v: number; id: string; provider: string }[] {
  const counts: Record<string, { n: string; v: number; id: string; provider: string }> = {};
  Store.hist.forEach(h => {
    const k = (h.provider || '') + ':' + h.id;
    if (!counts[k]) counts[k] = { n: h.title, v: 0, id: h.id, provider: h.provider };
    counts[k].v++;
  });
  return Object.values(counts)
    .sort((a, b) => b.v - a.v)
    .slice(0, limit);
}

function providerRows(): { n: string; v: number }[] {
  const c: Record<string, number> = {};
  Store.hist.forEach(h => {
    const id = h.provider || 'otakudesu';
    c[id] = (c[id] || 0) + 1;
  });
  const favC: Record<string, number> = {};
  Store.favs.forEach(f => {
    const id = f.provider || 'otakudesu';
    favC[id] = (favC[id] || 0) + 1;
  });
  const keys = [...new Set([...Object.keys(c), ...Object.keys(favC)])];
  return keys.map(id => ({
    n: (PROVIDERS[id] && PROVIDERS[id].name) || id,
    v: (c[id] || 0) + (favC[id] || 0)
  }));
}

function statusRows(): { n: string; v: number }[] {
  const labels: Record<string, string> = { ptw: 'Ingin Tonton', watching: 'Sedang Tonton', completed: 'Selesai', dropped: 'Dropped' };
  const c: Record<string, number> = {};
  Object.keys(Store.meta).forEach(k => {
    const s = Store.meta[k].status;
    c[s] = (c[s] || 0) + 1;
  });
  return Object.keys(labels).map(k => ({ n: labels[k], v: c[k] || 0 }));
}

export async function ViewStats(_r?: ParsedRoute): Promise<void> {
  const hist = Store.hist;
  const cont = Store.cont;
  const totalSec = hist.reduce((a, h) => a + (h.dur || 1440), 0);
  const rated = Object.keys(Store.meta).filter(k => Store.meta[k].rating > 0);
  const avg = rated.length
    ? (rated.reduce((a, k) => a + Store.meta[k].rating, 0) / rated.length).toFixed(1)
    : '—';

  host().innerHTML =
    '<div class="shell" style="padding-top:22px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Statistik</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">Ringkasan aktivitas menontonmu — semuanya tersimpan lokal di perangkat ini.</p></div>' +
    (!hist.length && !Store.favs.length
      ? stateHTML('empty', 'Belum ada data', 'Mulai menonton atau menambah favorit, lalu kembali ke sini untuk melihat statistiknya.', '<a class="btn primary" href="#/home" style="margin-top:6px">' + svg('play', '', 2) + ' Mulai Menonton</a>')
      : '') +
    '<div class="kpis rv in" style="margin-bottom:16px">' +
    '<div class="kpi"><div class="v">' + hist.length + '</div><div class="l">Episode ditonton</div></div>' +
    '<div class="kpi"><div class="v">' + cont.length + '</div><div class="l">Sedang berjalan</div></div>' +
    '<div class="kpi"><div class="v">' + Store.favs.length + '</div><div class="l">Favorit</div></div>' +
    '<div class="kpi"><div class="v">' + formatDuration(totalSec) + '</div><div class="l">Estimasi durasi</div></div>' +
    '<div class="kpi"><div class="v">' + avg + '</div><div class="l">Rata-rata rating</div></div>' +
    '<div class="kpi"><div class="v">' + fmtBytes(storageSize()) + '</div><div class="l">Data tersimpan</div></div>' +
    '</div>' +
    (providerRows().length
      ? '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('server', '', 2) + ' Per Provider</h3>' + hbar(providerRows()) + '</section>'
      : '') +
    (statusRows().some(r => r.v)
      ? '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('chart', '', 2) + ' Status Koleksi</h3>' + hbar(statusRows()) + '</section>'
      : '') +
    (topTitles(8).length
      ? '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('film', '', 2) + ' Paling Sering Ditonton</h3>' + hbar(topTitles(8).map(t => ({ n: t.n, v: t.v }))) + '</section>'
      : '') +
    (cont.length
      ? '<section class="panel rv" style="margin-bottom:14px"><h3>' + svg('clock', '', 2) + ' Sedang Berjalan</h3><div class="cw-list">' +
        cont.slice(0, 6).map(c => {
          const pct = Math.max(4, Math.min(100, Math.round(c.pct || 0)));
          return (
            '<a class="cw" href="' + watchHref(c.id, c.provider || 'otakudesu', c.ep, c.eid || '', c.eslug || '', c.slug) + '">' +
            '<span class="th"><img src="' + esc(c.cover || '') + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></span>' +
            '<span class="info"><b>' + esc(c.title) + '</b><span class="sub">Episode ' + esc(c.ep) + ' · ' + relTime(c.last || c.t || Date.now()) + '</span>' +
            '<span class="bar"><i style="width:' + pct + '%"></i></span></span>' +
            '<span class="go">' + svg('play', '', 2.2) + '</span></a>'
          );
        }).join('') +
        '</div></section>'
      : '') +
    (hist.length
      ? '<section class="panel rv"><h3>' + svg('clock', '', 2) + ' Aktivitas Terakhir</h3><div class="sched-list">' +
        hist.slice(0, 10).map(h =>
          '<a class="sched-row" href="' + detailHref(h.id, h.provider || 'otakudesu', h.slug) + '">' +
          '<span class="tm">' + esc(h.ep) + '<small>EP</small></span>' +
          '<span class="tx"><b>' + esc(h.title) + '</b><span>' + (h.t ? relTime(h.t) : '') + '</span></span>' +
          '<span style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:var(--dim)">' + svg('right', '', 2.2) + '</span>' +
          '</a>'
        ).join('') +
        '</div><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
        '<button class="btn ghost sm" data-act="export-data">' + svg('download', '', 2) + ' Ekspor data</button>' +
        '<a class="btn ghost sm" href="#/history">' + svg('clock', '', 2) + ' Semua riwayat</a>' +
        '</div></section>'
      : '') +
    footerHTML() + '</div>';

  initView(host());
}

function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
