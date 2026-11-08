import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icons';
import { useScrollGuard } from '../ui/hooks';
import { AppUsageTracker } from '../features/AppUsageTracker';
import { PlayerOverlay } from '../ui/PlayerOverlay';
import { LiquidGlass, useLiquidGlassEnhancer } from '../ui/liquid-glass';

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
    <LiquidGlass
      as="nav"
      className="hn-bottomnav lg-bar"
      data-lg-role="dock"
      aria-label="Navigasi utama"
      profile="soft"
      radius={0}
      strength={110}
      dispersion={0.015}
      adaptive
    >
      {NAV.map(item => {
        const active = isActive(pathname, item);
        return (
          <NavLink key={item.to} to={item.to} className={`hn-bottomnav-item${active ? ' hn-active' : ''}`}>
            <Icon name={item.icon} size={26} strokeWidth={1.75} />
            <span className="hn-bottomnav-label">{item.label}</span>
          </NavLink>
        );
      })}
    </LiquidGlass>
  );
}

/** Scroll-edge: hairline nav muncul hanya setelah konten bergulir di bawahnya (skill). */
function useNavScrollEdge() {
  useEffect(() => {
    const toggle = () => {
      const scrolled = window.scrollY > 8;
      document.querySelectorAll('.hn-pagehead, .hn-homehead').forEach(el => el.classList.toggle('scrolled', scrolled));
    };
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
    return () => window.removeEventListener('scroll', toggle);
  }, []);
}

export function Shell({ children }: { children: ReactNode }) {
  useScrollGuard();
  useNavScrollEdge();
  useLiquidGlassEnhancer();
  const { pathname } = useLocation();
  // Detail & pemutar fullscreen menyembunyikan nav bawah.
  const hideNav = pathname.startsWith('/detail/');
  return (
    <div className="hn-shell" data-lg-role="stage">
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
