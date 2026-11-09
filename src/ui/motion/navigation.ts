import { useEffect, useRef, type RefObject } from 'react';
import type { NavigationType } from 'react-router-dom';

/** Navigation Motion Engine — dock minimization + per-tab scroll memory. */

const TAB_ROOTS = new Set(['/home', '/search', '/public-chat', '/profile']);
const MINIMIZE_AFTER_PX = 28;
const RESTORE_AFTER_PX = 12;
const TOP_RESTORE_PX = 24;

export function expandNavigation(nav: HTMLElement | null): void {
  if (nav?.dataset.minimized === 'true') nav.dataset.minimized = 'false';
}

/**
 * Scrolling down past a small threshold minimizes the floating dock; scrolling
 * up (or returning to the top) expands it. The state is written straight to a
 * data attribute — no React render on scroll. Hysteresis prevents the dock
 * from flickering around the threshold.
 */
export function useNavigationMinimize(
  navRef: RefObject<HTMLElement | null>,
  resetKey: string,
): void {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === 'undefined') return;

    let lastY = Math.max(0, window.scrollY);
    let down = 0;
    let up = 0;
    let frame = 0;
    let scrolled = false;

    const setMinimized = (value: boolean) => {
      if ((nav.dataset.minimized === 'true') !== value) {
        nav.dataset.minimized = value ? 'true' : 'false';
      }
    };

    const apply = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;

      if (y <= TOP_RESTORE_PX) {
        down = 0;
        up = 0;
        setMinimized(false);
      } else if (delta > 0) {
        down += delta;
        up = 0;
        if (!nav.dataset.minimized || nav.dataset.minimized === 'false') {
          if (down >= MINIMIZE_AFTER_PX) setMinimized(true);
        }
      } else if (delta < 0) {
        up -= delta;
        down = 0;
        if (nav.dataset.minimized === 'true' && up >= RESTORE_AFTER_PX) {
          setMinimized(false);
        }
      }

      const nextScrolled = y > 8;
      if (nextScrolled !== scrolled) {
        scrolled = nextScrolled;
        nav.dataset.scrolled = nextScrolled ? 'true' : 'false';
      }
      lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    setMinimized(false);
    nav.dataset.scrolled = lastY > 8 ? 'true' : 'false';
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [navRef, resetKey]);
}

/**
 * Remembers the document scroll offset for every path. Bottom-tab roots keep
 * their position across tab switches; back/forward restores the previous page.
 * New pushes to non-tab pages start at the top.
 */
export function useRouteScroll(
  pathname: string,
  locationKey: string,
  navigationType: NavigationType,
): void {
  const positions = useRef(new Map<string, number>());
  const currentPath = useRef(pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const history = window.history;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    currentPath.current = pathname;
    const remember = () => positions.current.set(currentPath.current, Math.max(0, window.scrollY));
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = positions.current.get(pathname);
    const restores =
      navigationType === 'POP' || (navigationType === 'PUSH' && TAB_ROOTS.has(pathname));
    const target = restores && saved != null ? saved : 0;

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.scrollTo(0, target));
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pathname, locationKey, navigationType]);
}
