import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { useCountUp, useOnline } from './hooks';

/** Potongan UI umpan balik: skeleton, spinner, kosong, kepala seksi, progres. */

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`hn-spin ${className}`.trim()} role="status" aria-label="Memuat" />;
}

export function Skel({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`hn-skel ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function PosterSkel() {
  return (
    <div className="hn-card" aria-hidden="true">
      <Skel className="hn-skel-poster" />
      <Skel style={{ marginTop: 8, height: 12 }} />
      <Skel style={{ marginTop: 6, height: 10, width: '56%' }} />
    </div>
  );
}

export function RailSkel({ count = 4 }: { count?: number }) {
  return (
    <div className="hn-rail no-scrollbar" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ width: 132 }}>
          <PosterSkel />
        </div>
      ))}
    </div>
  );
}

export function ListSkel({ count = 4 }: { count?: number }) {
  return (
    <div className="hn-rowlist" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="hn-row" key={i}>
          <Skel style={{ width: 96, height: 64, flexShrink: 0, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <Skel style={{ height: 13, width: '72%' }} />
            <Skel style={{ marginTop: 8, height: 11, width: '46%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionHead({
  title,
  link,
  onLink
}: {
  title: string;
  link?: string;
  onLink?: () => void;
}) {
  return (
    <div className="hn-section-head">
      <h2 className="hn-section-title">{title}</h2>
      {link ? (
        <button type="button" className="hn-section-link" onClick={onLink}>
          {link}
          <Icon name="right" size={14} strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon = 'film',
  title,
  sub,
  action
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="hn-state">
      <span className="hn-state-icon">
        <Icon name={icon} strokeWidth={1.7} />
      </span>
      <p className="hn-state-title">{title}</p>
      {sub ? <p className="hn-state-sub">{sub}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon="wifiOff"
      title="Tidak bisa memuat"
      sub="Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti."
      action={
        onRetry ? (
          <button type="button" className="hn-ghostbtn" onClick={onRetry} style={{ marginTop: 8 }}>
            <Icon name="refresh" size={15} />
            Coba lagi
          </button>
        ) : null
      }
    />
  );
}

export function ProgressBar({
  value,
  blue,
  className = ''
}: {
  value: number;
  blue?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`hn-progressbar ${blue ? 'hn-blue' : ''} ${className}`.trim()} role="progressbar" aria-valuenow={Math.round(pct * 100)} style={{ position: 'static', width: '100%', marginTop: 8 }}>
      <div className="hn-progressbar-fill" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function OfflineBar({ show, text = 'Mode Luring — menampilkan salinan tersimpan' }: { show: boolean; text?: string }) {
  const online = useOnline();
  if (!show || online) return null;
  return (
    <div className="hn-inline-warn" role="status" style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
      <Icon name="wifiOff" />
      {text}
    </div>
  );
}

export function DateBadge({ label }: { label: string }) {
  return <div className="hn-row-sub" style={{ padding: '6px var(--pad-x)' }}>{label}</div>;
}

export function Stat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <div className="hn-stat" style={{ padding: '12px var(--pad-x)', textAlign: 'center' }}>
      <span style={{ display: 'block', fontWeight: 800, fontSize: 22 }}>{n}{suffix}</span>
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>{label}</span>
    </div>
  );
}

export function Badge({
  tone = 'gray',
  children
}: {
  tone?: 'green' | 'blue' | 'gold' | 'gray' | 'red';
  children: ReactNode;
}) {
  const color = { green: 'var(--accent-green)', blue: 'var(--accent-cyan)', gold: 'var(--accent-gold)', gray: 'var(--text-muted)', red: '#ff8a80' }[tone];
  return <span style={{ color, fontSize: 'var(--fs-label)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>{children}</span>;
}

export function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="hn-toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 48, height: 28, borderRadius: 999, position: 'relative',
        background: on ? 'var(--accent-primary)' : 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        transition: 'background var(--t-micro)'
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20,
        borderRadius: 999, background: '#fff', transition: 'left var(--t-micro) var(--ease)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
      }} />
    </button>
  );
}
