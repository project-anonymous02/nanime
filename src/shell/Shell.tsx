import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icons';
import { useScrollGuard } from '../ui/hooks';
import { AppUsageTracker } from '../features/AppUsageTracker';
import { PlayerOverlay } from '../ui/PlayerOverlay';

/** Kerangka aplikasi: konten, navigasi bawah, dan tumpukan toast. */

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  alias?: string[];
}

const NAV: NavItem[] = [
  { to: '/home', icon: 'home', label: 'Home' },
  { to: '/schedule', icon: 'calendar', label: 'Jadwal' },
  { to: '/favorites', icon: 'subscribed', label: 'Subscribed' },
  { to: '/history', icon: 'history', label: 'Riwayat' },
  { to: '/community', icon: 'socialLine', label: 'SocialLine' }
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
  // Only the five primary AniBiPlay tabs show the bottom navigation. Profile,
  // detail, settings, and chat are pushed screens in the source app.
  const mainTab = ['/home', '/schedule', '/favorites', '/history', '/community'].includes(pathname);
  return (
    <div className="app-shell">
      <AppUsageTracker />
      <main className={'app-main' + (pathname === '/public-chat' ? ' public-chat-main' : '')}>
        <div className="page" key={pathname}>
          {children}
        </div>
      </main>
      {mainTab ? <BottomNav /> : null}
      <PlayerOverlay />
    </div>
  );
}
