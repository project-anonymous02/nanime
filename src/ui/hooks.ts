import { useCallback, useEffect, useRef, useState } from 'react';

/** Kumpulan hook UI ringan — semua animasi memakai transform/opacity. */

/** Efek ripple di atas elemen apa pun (tanpa render ulang). */
export function useRipple<T extends HTMLElement>() {
  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    const host = e.currentTarget;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = size + 'px';
    ink.style.height = size + 'px';
    ink.style.left = e.clientX - rect.left + 'px';
    ink.style.top = e.clientY - rect.top + 'px';
    host.appendChild(ink);
    window.setTimeout(() => ink.remove(), 640);
  }, []);
  return onPointerDown;
}

/** Tandai `.reveal` di dalam kontainer agar muncul saat masuk viewport. */
export function useReveal<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      root?.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
    );
    root.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Angka berjalan 0 → target (statistik profil). */
export function useCountUp(target: number, opts: { duration?: number; delay?: number } = {}) {
  const { duration = 900, delay = 0 } = opts;
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    let startTs = 0;
    let timer = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      setValue(Math.round(ease(t) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);
  return value;
}

/** true saat halaman digulir melewati ambang (bayangan topbar). */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled(window.scrollY > threshold);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return scrolled;
}

/** Status koneksi perangkat (untuk bilah mode luring). */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export interface PullState {
  pull: number;
  refreshing: boolean;
}

/**
 * Tarik-untuk-menyegarkan (sentuh). Mengembalikan jarak tarikan dalam px dan
 * status menyegarkan, ditambah handler untuk dipasang di elemen pembungkus.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | void, enabled = true) {
  const [state, setState] = useState<PullState>({ pull: 0, refreshing: false });
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPull = useCallback((v: number) => {
    pullRef.current = v;
    setState(s => (s.pull === v ? s : { ...s, pull: v }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if ((window.scrollY || document.documentElement.scrollTop) > 2) return;
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      setPull(Math.min(120, dy * 0.45));
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      startY.current = null;
      const dist = pullRef.current;
      setPull(0);
      if (dist < 62 || refreshingRef.current) return;
      refreshingRef.current = true;
      setState(s => ({ ...s, refreshing: true }));
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => {
          refreshingRef.current = false;
          setState(s => ({ ...s, refreshing: false }));
        }, 420);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, onRefresh, setPull]);

  return state;
}

/** Nilai yang ditunda (kotak pencarian). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Media query reaktif (mis. prefers-reduced-motion). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Matikan animasi masuk saat gulir cepat: <html data-scrolling="1">.
 * Dipasang sekali di shell agar seluruh halaman tetap 60fps.
 */
export function useScrollGuard() {
  useEffect(() => {
    const root = document.documentElement;
    let idle = 0;
    let active = false;
    const onScroll = () => {
      if (!active) {
        active = true;
        root.dataset.scrolling = '1';
      }
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        active = false;
        delete root.dataset.scrolling;
      }, 140);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(idle);
      delete root.dataset.scrolling;
    };
  }, []);
}
