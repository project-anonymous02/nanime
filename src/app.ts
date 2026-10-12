import { Store } from './core/store';
import { esc } from './core/utils';
import { svg } from './core/icons';
import { parseHash, go, back, type ParsedRoute } from './core/router';
import { railScroll, initView } from './ui/dom';
import { toast } from './ui/toast';
import { renderNav } from './ui/nav';
import { ViewHome, homeRandom, initDashVideo } from './views/home';
import { ViewSearch, SearchActions } from './views/search';
import { ViewExplore } from './views/explore';
import { ViewFavorite, FavoriteActions } from './views/favorite';
import { ViewHistory, HistoryActions } from './views/history';
import { ViewGenre } from './views/genre';
import { ViewDetail, DetailState, watchMovieFlow, loadBatchDownloads } from './views/detail';
import { ViewWatch, WatchActions } from './views/watch';
import { ViewSchedule, ScheduleActions } from './views/schedule';
import { ViewStats } from './views/stats';
import { closeSheet } from './ui/sheet';
import { openSettings, SettingsActions } from './features/settings';
import { openPalette } from './features/shortcuts';
import { exportData } from './features/exportImport';
import { clearNewEpisodes } from './features/notify';

const view = () => document.getElementById('view') as HTMLElement;
const backBtn = () => document.getElementById('tbBack') as HTMLButtonElement | null;

let curRoute = '';
let navToken = 0;

export function currentRoute(): string {
  return curRoute;
}

export async function render(r?: ParsedRoute): Promise<void> {
  const route = r || parseHash();
  const token = ++navToken;
  curRoute = route.path;

  const main = view();
  const nested = route.parts[0] === 'watch' || route.parts[0] === 'anime';
  const bb = backBtn();
  if (bb) {
    bb.style.display = nested ? '' : 'none';
    const brand = document.getElementById('tbBrand');
    if (brand) (brand as HTMLElement).style.display = nested ? 'none' : '';
  }
  renderNav();
  main.classList.remove('anim-in');
  void main.offsetWidth;
  main.classList.add('anim-in');

  const first = route.parts[0] || 'home';
  try {
    if (first === 'home') {
      clearNewEpisodes();
      await ViewHome(route);
      if (token === navToken) renderNav();
    } else if (first === 'search') await ViewSearch(route);
    else if (first === 'explore') await ViewExplore(route);
    else if (first === 'favorite') await ViewFavorite(route);
    else if (first === 'history') await ViewHistory(route);
    else if (first === 'genre') await ViewGenre(route);
    else if (first === 'anime') await ViewDetail(route);
    else if (first === 'watch') await ViewWatch(route);
    else if (first === 'schedule') await ViewSchedule(route);
    else if (first === 'stats') await ViewStats(route);
    else if (first === 'settings') {
      await ViewHome(route);
      setTimeout(openSettings, 120);
    } else {
      toast('Halaman tidak ditemukan.', 'err');
      go('/home', true);
      return;
    }
  } catch (e: any) {
    console.error('View render failed:', first, e);
    if (token === navToken && !view().children.length) {
      view().innerHTML =
        '<div class="shell" style="padding-top:40px"><div class="state rv in"><div class="ic">' + svg('alert', '', 1.7) +
        '</div><h3>Terjadi kesalahan</h3><p>' + esc(e?.message || 'Gagal memuat halaman.') + '</p>' +
        '<button class="btn primary" data-act="reload">Muat ulang</button></div></div>';
      initView(view());
    }
  }

  if (!nested) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

function toggleFav(btn: HTMLElement): void {
  const id = btn.getAttribute('data-fav') || '';
  const rawProv = btn.getAttribute('data-provider') || '';
  const provider = rawProv || Store.getProvider();
  const added = Store.toggleFav({
    id,
    title: btn.getAttribute('data-title') || '',
    cover: btn.getAttribute('data-cover') || '',
    provider,
    score: btn.getAttribute('data-score') || '',
    epLabel: btn.getAttribute('data-epl') || '',
    sub: btn.getAttribute('data-sub') || '',
    type: btn.getAttribute('data-type') || '',
    slug: btn.getAttribute('data-slug') || ''
  });
  document.querySelectorAll<HTMLElement>('[data-fav]').forEach(b => {
    if (b.getAttribute('data-fav') !== id || (b.getAttribute('data-provider') || '') !== rawProv) return;
    if (b.classList.contains('btn')) {
      const sm = b.classList.contains('sm');
      b.className = 'btn' + (added ? ' danger' : ' ghost') + (sm ? ' sm' : '');
      b.innerHTML = added ? svg('heart', '', 2.1) + ' Tersimpan' : svg('heart', '', 2.1) + ' Favorit';
    } else {
      b.classList.toggle('on', added);
    }
    b.setAttribute('aria-pressed', String(added));
    b.classList.remove('beat');
    void b.offsetWidth;
    b.classList.add('beat');
  });
  toast(added ? 'Ditambahkan ke favorit.' : 'Dihapus dari favorit.', added ? 'ok' : 'info');
  renderNav();
  if (curRoute === '/favorite') ViewFavorite();
}

function shareCurrent(title: string): void {
  const url = location.href;
  const data = { title, url };
  if (navigator.share) {
    navigator.share(data).catch(() => {});
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => toast('Tautan disalin ke papan klip.', 'ok'),
      () => toast('Gagal menyalin tautan.', 'err')
    );
    return;
  }
  toast(url, 'info', 'Tautan');
}

function setPersonal(patch: { status?: 'ptw' | 'watching' | 'completed' | 'dropped'; rating?: number }): void {
  const det = DetailState.det;
  if (!det) return;
  Store.setMeta(det.id, patch);
  const id = det.id;
  const meta = Store.meta[id] || { status: 'ptw' as const, rating: 0, t: 0 };
  document.querySelectorAll<HTMLElement>('[data-act="set-status"]').forEach(b => {
    b.classList.toggle('on', b.getAttribute('data-v') === meta.status);
  });
  document.querySelectorAll<HTMLElement>('#stars button').forEach(b => {
    const n = +b.getAttribute('data-v')!;
    b.classList.toggle('on', meta.rating >= n);
  });
  toast(patch.rating != null ? 'Penilaian disimpan: ' + patch.rating + '★' : 'Status diperbarui.', 'ok');
}

async function handleAct(act: HTMLElement, e: MouseEvent): Promise<void> {
  const a = act.getAttribute('data-act') || '';

  switch (a) {
    case 'open-settings':
      e.preventDefault();
      openSettings();
      return;
    case 'close-sheet':
      e.preventDefault();
      closeSheet();
      return;
    case 'reload':
      location.reload();
      return;
    case 'net-retry':
      location.reload();
      return;
    case 'back':
      e.preventDefault();
      back();
      return;
    case 'goto': {
      e.preventDefault();
      const to = act.getAttribute('data-to') || '#/home';
      go(to.replace(/^#/, ''));
      return;
    }
    case 'toggle-syn': {
      const s = document.getElementById('syn');
      if (!s) return;
      const open = s.classList.toggle('clip') === false;
      act.classList.toggle('open', open);
      act.innerHTML = (open ? 'Tampilkan lebih sedikit ' : 'Baca selengkapnya ') + svg('down', '', 2.4);
      return;
    }
    case 'watch-movie':
      e.preventDefault();
      await watchMovieFlow();
      return;
    case 'watch-first': {
      const det = DetailState.det;
      const idx = Number(act.getAttribute('data-ep') || '0');
      const ep = DetailState.ep[idx];
      if (det && ep) {
        go(
          '/watch/' + encodeURIComponent(det.id) + '/' + encodeURIComponent(ep.num) +
          '?provider=' + encodeURIComponent(det.provider) + '&eid=' + encodeURIComponent(ep.id) + '&eslug=' + encodeURIComponent(ep.slug || '')
        );
      }
      return;
    }
    case 'clear-fav':
    case 'clear-favs':
      if (confirm('Kosongkan semua favorit?')) {
        Store.favs = [];
        localStorage.setItem('nanime.v2.favs', '[]');
        renderNav();
        if (curRoute === '/favorite') ViewFavorite();
        toast('Favorit dikosongkan.', 'ok');
      }
      return;
    case 'clear-hist':
      if (confirm('Hapus semua riwayat?')) {
        Store.hist = [];
        Store.cont = [];
        localStorage.setItem('nanime.v2.hist', '[]');
        localStorage.setItem('nanime.v2.cont', '[]');
        if (curRoute === '/history') ViewHistory();
        if (curRoute === '/stats') ViewStats();
        toast('Riwayat dihapus.', 'ok');
      }
      return;
    case 'del-cont': {
      const id = act.getAttribute('data-id') || '';
      const prov = act.getAttribute('data-provider') || '';
      Store.removeProgress(id, prov);
      e.preventDefault();
      e.stopPropagation();
      const card = act.closest('.cw');
      if (card && card.parentElement) card.parentElement.remove();
      renderNav();
      return;
    }
    case 'del-hist': {
      e.preventDefault();
      e.stopPropagation();
      HistoryActions.remove(act.getAttribute('data-id') || '', act.getAttribute('data-provider') || '');
      renderNav();
      return;
    }
    case 'set-provider':
      SettingsActions.setProvider(act.getAttribute('data-id') || '');
      return;
    case 'toggle':
      SettingsActions.toggle(act.getAttribute('data-k') as 'autoNext' | 'autoplay' | 'dataSaver' | 'keepHistory');
      return;
    case 'toggle-notify':
      SettingsActions.toggleNotify();
      return;
    case 'set-theme':
      SettingsActions.setTheme(act.getAttribute('data-v') || 'dark');
      return;
    case 'set-accent':
      SettingsActions.setAccent(act.getAttribute('data-v') || '');
      return;
    case 'set-quality':
      return;
    case 'set-interval':
      return;
    case 'ping':
      SettingsActions.ping(act.getAttribute('data-src') || 'wajik');
      return;
    case 'clear-cache':
      SettingsActions.clearCache();
      return;
    case 'verify-all':
      SettingsActions.verifyAll();
      return;
    case 'export-data':
      exportData();
      toast('Cadangan diunduh.', 'ok');
      return;
    case 'reset-all':
      SettingsActions.resetAll();
      return;
    case 'rail':
      e.preventDefault();
      railScroll(act.getAttribute('data-rail') || '', Number(act.getAttribute('data-dir') || '1'));
      return;
    case 'retry-search':
      SearchActions.retry();
      return;
    case 'clear-shist':
      SearchActions.clearQ();
      return;
    case 'use-q':
      SearchActions.useQ(act.getAttribute('data-q') || '');
      return;
    case 'sf':
      SearchActions.setFilter(act.getAttribute('data-v') || 'all');
      return;
    case 'ss':
      SearchActions.setSort(act.getAttribute('data-v') || 'rel');
      return;
    case 'st':
      SearchActions.setType(act.getAttribute('data-v') || 'all');
      return;
    case 's-clear':
      return;
    case 'fav-sort':
      FavoriteActions.setSort(act.getAttribute('data-v') || 'recent');
      return;
    case 'sched-day':
      ScheduleActions.setDay(Number(act.getAttribute('data-d') || '0'));
      return;
    case 'random-anime':
      homeRandom();
      return;
    case 'random-result':
      SearchActions.random();
      return;
    case 'load-batch': {
      const det = DetailState.det;
      if (det && det.batchId) {
        (act as HTMLButtonElement).disabled = true;
        act.innerHTML = svg('refresh', '', 2.1) + ' Memuat…';
        await loadBatchDownloads(det.batchId);
      }
      return;
    }
    case 'rate':
      setPersonal({ rating: Number(act.getAttribute('data-v') || '0') });
      return;
    case 'set-status':
      setPersonal({ status: (act.getAttribute('data-v') || 'ptw') as 'ptw' | 'watching' | 'completed' | 'dropped' });
      return;
    case 'share-detail': {
      const det = DetailState.det;
      shareCurrent(det ? det.title + ' — Nanime' : 'Nanime');
      return;
    }
    case 'share-watch':
      WatchActions.share();
      return;
    case 'open-queue':
      WatchActions.openQueue();
      return;
    case 'use-embed':
      WatchActions.useEmbed();
      return;
    case 'use-native':
      WatchActions.useNative();
      return;
    case 'open-palette':
      e.preventDefault();
      openPalette();
      return;
    default:
      return;
  }
}

export function bindGlobal(): void {
  document.addEventListener('click', async e => {
    const t = e.target as HTMLElement;

    if (curRoute === 'search') {
      const q = SearchActions.currentQuery();
      if (t.closest('a.card') && q) Store.addQ(q);
    }

    const fav = t.closest('[data-fav]') as HTMLElement | null;
    if (fav) {
      e.preventDefault();
      e.stopPropagation();
      toggleFav(fav);
      return;
    }

    const act = t.closest('[data-act]') as HTMLElement | null;
    if (act) {
      const tag = (act.tagName || '').toLowerCase();
      if (tag !== 'select' && tag !== 'input' && tag !== 'label') e.preventDefault();
      await handleAct(act, e);
      return;
    }

    const railBtn = t.closest('[data-rail]') as HTMLElement | null;
    if (railBtn) {
      e.preventDefault();
      railScroll(railBtn.getAttribute('data-rail') || '', Number(railBtn.getAttribute('data-dir') || '1'));
    }
  });

  document.addEventListener('change', e => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-act="set-quality"]')) {
      SettingsActions.setQuality((el as HTMLSelectElement).value);
    } else if (el.matches('[data-act="set-interval"]')) {
      SettingsActions.setInterval((el as HTMLSelectElement).value);
    }
  });

  document.addEventListener('nanime:open-settings' as any, () => openSettings());

  window.addEventListener('hashchange', () => render());
  window.addEventListener('storage', ev => {
    if (ev.key && ev.key.indexOf('nanime.v2.') === 0) {
      Store.favs = JSON.parse(localStorage.getItem('nanime.v2.favs') || '[]');
      Store.hist = JSON.parse(localStorage.getItem('nanime.v2.hist') || '[]');
      renderNav();
    }
  });

  window.addEventListener('popstate', () => render());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && curRoute === '/home') initDashVideo();
  });
}

export const ROUTES = {
  home: ViewHome,
  search: ViewSearch,
  explore: ViewExplore,
  favorite: ViewFavorite,
  history: ViewHistory,
  genre: ViewGenre,
  anime: ViewDetail,
  watch: ViewWatch,
  schedule: ViewSchedule,
  stats: ViewStats
};

export type RouteName = keyof typeof ROUTES;
export type { ParsedRoute };
