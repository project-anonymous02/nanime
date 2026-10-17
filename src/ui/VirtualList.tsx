import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Daftar maya berbasis gulir jendela — hanya merender item yang terlihat.
 * Untuk daftar pendek (< threshold) dirender langsung agar sederhana.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 6,
  gap = 10,
  threshold = 50,
  className = ''
}: {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  gap?: number;
  threshold?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [win, setWin] = useState({ docTop: 0, scrollY: 0, viewport: 800 });

  useLayoutEffect(() => {
    if (items.length < threshold) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setWin({ docTop: rect.top + scrollY, scrollY, viewport: window.innerHeight || 800 });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length, threshold]);

  if (items.length < threshold) {
    return (
      <div className={className}>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: i < items.length - 1 ? gap : 0 }}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const stride = itemHeight + gap;
  const rel = Math.max(0, win.scrollY - win.docTop);
  const start = Math.max(0, Math.floor(rel / stride) - overscan);
  const count = Math.ceil(win.viewport / stride) + overscan * 2;
  const end = Math.min(items.length, start + count);
  const total = items.length * stride - gap;
  const slice: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    slice.push(
      <div key={i} style={{ height: itemHeight, marginBottom: gap }}>
        {renderItem(items[i], i)}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative', height: total }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translate3d(0,${start * stride}px,0)` }}>
        {slice}
      </div>
    </div>
  );
}
