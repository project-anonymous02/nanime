import type { PullState } from './hooks';

export function PullToRefreshIndicator({ state }: { state: PullState }) {
  const label = state.refreshing ? 'Menyegarkan…' : state.armed ? 'Lepaskan untuk menyegarkan' : '';
  return (
    <div
      className="hn-ptr"
      style={{ height: state.refreshing ? 46 : state.pull, opacity: state.pull > 0 || state.refreshing ? 1 : 0, display: 'grid', placeItems: 'center', overflow: 'hidden', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}
      role="status"
      aria-live="polite"
      aria-label={label || undefined}
    >
      <span className="spinner-sm" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
