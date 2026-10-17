import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Tab dengan garis tinta geser + kontrol segmen. */

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [ink, setInk] = useState({ x: 0, w: 0 });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const el = row.querySelector<HTMLElement>('.tab-item.active');
      if (!el) return;
      setInk({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(row);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active, tabs.length]);

  return (
    <div className="tabs" ref={rowRef} role="tablist">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={'tab-item' + (active === t.key ? ' active' : '')}
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
      <span className="tab-ink" style={{ transform: `translate3d(${ink.x}px,0,0)`, width: ink.w }} />
    </div>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={'seg-item' + (value === o.key ? ' active' : '')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
