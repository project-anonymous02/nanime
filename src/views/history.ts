import { Store } from '../core/store';
import { esc, relTime, formatDuration } from '../core/utils';
import { svg } from '../core/icons';
import { initView } from '../ui/dom';
import { footerHTML } from '../ui/components';
import { watchHref, type ParsedRoute } from '../core/router';
import type { HistItem } from '../core/types';

const host = () => document.getElementById('view') as HTMLElement;

function paint(): void {
  const box = document.getElementById('histBox');
  if (!box) return;
  const hist = Store.hist;
  if (!hist.length) {
    box.innerHTML =
      '<div class="state rv in"><div class="ic">' + svg('clock', '', 1.7) + '</div><h3>Belum Ada Riwayat</h3>' +
      '<p>Anime yang kamu tonton akan otomatis tersimpan di sini.</p>' +
      '<a class="btn primary" href="#/home" style="margin-top:6px">' + svg('play', '', 2) + ' Mulai Menonton</a></div>';
    return;
  }
  box.innerHTML =
    '<div class="grid wide">' +
    hist
      .map((h, i) => {
        const cont = Store.cont.find(c => c.id === h.id && (c.provider || '') === (h.provider || ''));
        const pct = cont ? Math.round(cont.pct || 0) : 0;
        return (
          '<div class="rv-s" style="--d:' + ((i % 8) * 36) + 'ms">' +
          '<a class="card g" href="' + watchHref(h.id, h.provider || 'otakudesu', h.ep, h.eid || '', h.eslug || '', h.slug) + '">' +
          '<div class="poster"><span class="perr" aria-hidden="true">' + svg('film', '', 1.7) + '</span>' +
          '<img src="' + esc(h.cover || '') + '" class="ld" alt="' + esc(h.title) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<div class="veil"></div><span class="badge">EP ' + esc(h.ep) + '</span>' +
          (pct > 0 ? '<span class="badge score" style="left:8px;right:auto">' + pct + '%</span>' : '') +
          '<div class="play-ov"><span class="cir">' + svg('play') + '</span></div></div>' +
          '<div class="body"><div class="nm">' + esc(h.title) + '</div>' +
          '<div class="meta">Episode ' + esc(h.ep) + (h.t ? '<i></i>' + relTime(h.t) : '') + '</div></div></a>' +
          '<button class="fav-btn" data-act="del-hist" data-id="' + esc(h.id) + '" data-provider="' + esc(h.provider || '') +
            '" aria-label="Hapus dari riwayat">' + svg('x', '', 2.4) + '</button>' +
          '</div>'
        );
      })
      .join('') +
    '</div>';
  initView(box);
}

export async function ViewHistory(_r?: ParsedRoute): Promise<void> {
  const hist: HistItem[] = Store.hist;
  const cont = Store.cont;
  host().innerHTML =
    '<div class="shell" style="padding-top:22px">' +
    '<div class="rv in" style="margin-bottom:18px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Riwayat</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">' +
      (hist.length ? hist.length + ' anime ditonton · ' + cont.length + ' sedang berjalan' : 'Anime yang ditonton akan muncul di sini') +
    '</p></div>' +
    (hist.length
      ? '<div class="kpis" style="margin-bottom:18px">' +
        '<div class="kpi"><div class="v">' + hist.length + '</div><div class="l">Episode</div></div>' +
        '<div class="kpi"><div class="v">' + cont.length + '</div><div class="l">Lanjut nonton</div></div>' +
        '<div class="kpi"><div class="v">' + formatDuration(hist.length * 24 * 60) + '</div><div class="l">Estimasi durasi</div></div>' +
        '</div>'
      : '') +
    '<div id="histBox"></div>' +
    (hist.length
      ? '<div style="display:flex;gap:9px;margin-top:22px;flex-wrap:wrap">' +
        '<a class="btn ghost sm" href="#/stats">' + svg('chart', '', 2) + ' Statistik</a>' +
        '<button class="btn danger sm" data-act="clear-hist">' + svg('trash', '', 2) + ' Hapus Riwayat</button></div>'
      : '') +
    footerHTML() + '</div>';
  paint();
}

export const HistoryActions = {
  remove(id: string, provider: string) {
    Store.removeHist(id, provider);
    paint();
  },
  repaint: paint
};
