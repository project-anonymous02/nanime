import type { ReactNode } from 'react';

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
  return (
    <div className="hn-chiprow" role="tablist" style={{ padding: '4px var(--pad-x) 12px' }}>
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`hn-chip${active === t.key ? ' hn-active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
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
    <div className="hn-chiprow" role="tablist">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={`hn-chip${value === o.key ? ' hn-active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
