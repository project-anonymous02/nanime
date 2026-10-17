import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { useCountUp, useOnline } from './hooks';

/** Potongan UI umpan balik: skeleton, spinner, kosong, kepala seksi, progres. */

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={'spinner-sm ' + className} role="status" aria-label="Memuat" />;
}

export function Skel({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={'skel ' + className} style={style} aria-hidden="true" />;
}

export function PosterSkel() {
  return (
    <div className="anime-card" aria-hidden="true">
      <Skel className="poster" />
      <Skel className="line w80" style={{ marginTop: 8 }} />
      <Skel className="line w40" style={{ marginTop: 6 }} />
    </div>
  );
}

export function RailSkel({ count = 4 }: { count?: number }) {
  return (
    <div className="rail no-scrollbar" aria-hidden="true">
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
    <div className="stack" style={{ display: 'grid', gap: 10 }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card" style={{ padding: 10, display: 'flex', gap: 12 }}>
          <Skel className="thumb" style={{ width: 96 }} />
          <div style={{ flex: 1 }}>
            <Skel className="line w80" />
            <Skel className="line w40" style={{ marginTop: 8 }} />
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
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {link ? (
        <button type="button" className="section-link" onClick={onLink}>
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
    <div className="empty anim-fade">
      <span className="empty-icon">
        <Icon name={icon} strokeWidth={1.7} />
      </span>
      <p className="empty-title">{title}</p>
      {sub ? <p className="empty-sub">{sub}</p> : null}
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
          <button type="button" className="btn outline sm" onClick={onRetry} style={{ marginTop: 8 }}>
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
    <div className={'progress ' + (blue ? 'blue ' : '') + className} role="progressbar" aria-valuenow={Math.round(pct * 100)}>
      <div className="progress-fill in" style={{ '--pct': pct } as CSSProperties} />
    </div>
  );
}

export function OfflineBar({ show, text = 'Mode Luring — menampilkan salinan tersimpan' }: { show: boolean; text?: string }) {
  const online = useOnline();
  if (!show || online) return null;
  return (
    <div className="offline-bar" role="status">
      <Icon name="wifiOff" />
      {text}
    </div>
  );
}

export function DateBadge({ label }: { label: string }) {
  return <div className="date-badge">{label}</div>;
}

export function Stat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <div className="stat">
      <span className="stat-num">
        {n}
        {suffix}
      </span>
      <span className="stat-label">{label}</span>
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
  return <span className={'badge ' + tone}>{children}</span>;
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
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}
