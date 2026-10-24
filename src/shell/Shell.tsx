import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icons';
import { useScrollGuard } from '../ui/hooks';
import { AppUsageTracker } from '../features/AppUsageTracker';
import { PlayerOverlay } from '../ui/PlayerOverlay';

/** Kerangka aplikasi: konten, navigasi bawah, dan pemutar mini. */

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
}

const NAV: NavItem[] = [
  { to: '/home', icon: 'home', label: 'Home' },
  { to: '/search', icon: 'search', label: 'Cari' },
  { to: '/public-chat', icon: 'chat', label: 'Chat' },
  { to: '/profile', icon: 'user', label: 'Profil' }
];

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.to) return true;
  if (pathname.startsWith(item.to + '/')) return true;
  return false;
}

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="hn-bottomnav" aria-label="Navigasi utama">
      {NAV.map(item => {
        const active = isActive(pathname, item);
        return (
          <NavLink key={item.to} to={item.to} className={`hn-bottomnav-item${active ? ' hn-active' : ''}`}>
            <Icon name={item.icon} strokeWidth={active ? 2.3 : 1.9} />
            <span className="hn-bottomnav-label">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  useScrollGuard();
  const { pathname } = useLocation();
  // Detail & pemutar fullscreen menyembunyikan nav bawah.
  const hideNav = pathname.startsWith('/detail/');
  return (
    <div className="hn-shell">
      <AppUsageTracker />
      <main className="hn-main">
        <div className="hn-main-scroll" key={pathname}>
          {children}
        </div>
      </main>
      {hideNav ? null : <BottomNav />}
      <PlayerOverlay />
    </div>
  );
}
