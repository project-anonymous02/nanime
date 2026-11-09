import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { Icon, type IconName } from '../ui/icons';
import { useScrollGuard } from '../ui/hooks';
import { expandNavigation, useNavigationMinimize, useRouteScroll, useScrollReveal } from '../ui/motion';
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

/** Floating glass dock: shared sliding indicator + scroll minimization. */
function BottomNav() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const activeIndex = Math.max(0, NAV.findIndex(item => isActive(pathname, item)));

  useNavigationMinimize(navRef, pathname);

  return (
    <LiquidGlass
      as="nav"
      ref={navRef}
      className="hn-bottomnav"
      data-lg-role="dock"
      aria-label="Navigasi utama"
      profile="soft"
      radius={26}
      strength={110}
      dispersion={0.015}
      adaptive
      style={{ '--nav-active': activeIndex, '--nav-count': NAV.length } as CSSProperties}
      onPointerDownCapture={() => expandNavigation(navRef.current)}
      onFocusCapture={() => expandNavigation(navRef.current)}
    >
      <div className="hn-bottomnav-inner">
        <span className="hn-bottomnav-pill" aria-hidden="true" />
        {NAV.map((item, index) => {
          const active = index === activeIndex;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`hn-bottomnav-item${active ? ' hn-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="hn-bottomnav-icon">
                <Icon name={item.icon} size={26} strokeWidth={1.75} />
              </span>
              <span className="hn-bottomnav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </LiquidGlass>
  );
}

/** Scroll-edge: hairline nav muncul hanya setelah konten bergulir di bawahnya (skill). */
function useNavScrollEdge() {
  useEffect(() => {
    let raf: number | null = null;
    let last = false;
    const toggle = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const scrolled = window.scrollY > 8;
        if (scrolled === last) return;
        last = scrolled;
        document.querySelectorAll('.hn-pagehead, .hn-homehead').forEach(el => el.classList.toggle('scrolled', scrolled));
      });
    };
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
    return () => { window.removeEventListener('scroll', toggle); if (raf !== null) cancelAnimationFrame(raf); };
  }, []);
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();

  useScrollGuard();
  useNavScrollEdge();
  useScrollReveal();
  useLiquidGlassEnhancer();
  useRouteScroll(location.pathname, location.key, navigationType);

  // Detail & pemutar fullscreen menyembunyikan nav bawah.
  const hideNav = location.pathname.startsWith('/detail/');
  return (
    <div className="hn-shell" data-lg-role="stage">
      <AppUsageTracker />
      <main className="hn-main">
        <div
          className="hn-main-scroll"
          key={location.pathname}
          data-nav={navigationType === 'POP' ? 'pop' : 'push'}
        >
          {children}
        </div>
      </main>
      {hideNav ? null : <BottomNav />}
      <PlayerOverlay />
    </div>
  );
}
