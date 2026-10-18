import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icons';
import { useScrollGuard } from '../ui/hooks';

/** Kerangka aplikasi: konten, navigasi bawah, dan tumpukan toast. */

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  alias?: string[];
}

const NAV: NavItem[] = [
  { to: '/home', icon: 'home', label: 'Beranda' },
  { to: '/schedule', icon: 'calendar', label: 'Jadwal' },
  { to: '/favorites', icon: 'heart', label: 'Favorit' },
  { to: '/history', icon: 'clock', label: 'Riwayat' },
  { to: '/community', icon: 'globe', label: 'Komunitas' },
  { to: '/profile', icon: 'user', label: 'Profil', alias: ['/settings'] }
];

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.to) return true;
  if (pathname.startsWith(item.to + '/')) return true;
  return (item.alias || []).some(a => pathname === a || pathname.startsWith(a + '/'));
}

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      {NAV.map(item => {
        const active = isActive(pathname, item);
        return (
          <NavLink key={item.to} to={item.to} className={'nav-item' + (active ? ' active' : '')} replace={false}>
            {active ? <span className="nav-indicator" /> : null}
            <Icon name={item.icon} strokeWidth={active ? 2.2 : 1.9} />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  useScrollGuard();
  const { pathname } = useLocation();
  const bare = pathname.startsWith('/watch/');
  return (
    <div className="app-shell">
      <main className={'app-main' + (bare ? ' watch' : '')}>
        <div className="page" key={pathname}>
          {children}
        </div>
      </main>
      {bare ? null : <BottomNav />}
    </div>
  );
}
