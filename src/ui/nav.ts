import { NAV } from '../core/config';
import { Store } from '../core/store';
import { svg } from '../core/icons';
import { newEpisodeCount } from '../features/notify';

function isActive(id: string, cur: string, path: string): boolean {
  if (cur === path) return true;
  if (id === 'search' && cur.indexOf('#/search') === 0) return true;
  if (id === 'explore' && (cur.indexOf('#/explore') === 0 || cur.indexOf('#/genre') === 0 || cur.indexOf('#/schedule') === 0)) return true;
  if (id === 'library' && ['#/favorite', '#/history', '#/stats'].some(p => cur.indexOf(p) === 0)) return true;
  if (id === 'profile' && cur.indexOf('#/settings') === 0) return true;
  return false;
}

export function renderNav(): void {
  const cur = (location.hash || '#/home').split('?')[0];
  const news = newEpisodeCount();

  const tabbar = document.getElementById('tabbar');
  if (tabbar) {
    tabbar.innerHTML = NAV.map(n => {
      const act = isActive(n.id, cur, n.path);
      let badge = '';
      if (n.id === 'library' && Store.favs.length) badge = '<span class="badge">' + Store.favs.length + '</span>';
      if (n.id === 'home' && news > 0) badge = '<span class="badge">' + news + '</span>';
      return (
        '<a class="tab' + (act ? ' active' : '') + '" href="' + n.path + '" aria-label="' + n.label + '"' +
        (act ? ' aria-current="page"' : '') + '><span class="ind"></span>' + svg(n.icon, '', 2) +
        '<span>' + n.label + '</span>' + badge + '</a>'
      );
    }).join('');
  }

  const sbNav = document.getElementById('sbNav');
  if (sbNav) {
    sbNav.innerHTML = NAV.map(n => {
      const act = isActive(n.id, cur, n.path);
      let pill = '';
      if (n.id === 'library' && Store.favs.length) pill = '<span class="pill">' + Store.favs.length + '</span>';
      if (n.id === 'home' && news > 0) pill = '<span class="pill">' + news + '</span>';
      return (
        '<a class="sb-link' + (act ? ' active' : '') + '" href="' + n.path + '"' + (act ? ' aria-current="page"' : '') +
        '>' + svg(n.icon, '', 2) + '<span>' + n.label + '</span>' + pill + '</a>'
      );
    }).join('');
  }

  renderStatus();
}

export function renderStatus(): void {
  const sb = document.getElementById('sbStatus');
  if (sb) {
    sb.innerHTML =
      '<div class="row"><span class="dot on"></span><span>Sumber: <b>Otomatis</b></span></div>' +
      '<div style="margin-top:7px;font-size:10.5px;color:var(--dim)">Client-side · Tanpa backend</div>';
  }
  const tb = document.getElementById('tbStatus');
  if (tb) tb.innerHTML = '<span class="dot on" title="Multi-sumber otomatis Online"></span>';
}
