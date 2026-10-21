import type { PullState } from './hooks';

export function PullToRefreshIndicator({ state }: { state: PullState }) {
  const label = state.refreshing ? 'Menyegarkan…' : state.armed ? 'Lepaskan untuk menyegarkan' : '';
  return (
    <div
      className={'ptr' + (state.refreshing ? ' refreshing' : state.armed ? ' armed' : '')}
      style={{ height: state.refreshing ? 46 : state.pull, opacity: state.pull > 0 || state.refreshing ? 1 : 0 }}
      role="status"
      aria-live="polite"
      aria-label={label || undefined}
    >
      <span className="ptr-ring" />
      {label ? <span className="ptr-label">{label}</span> : null}
    </div>
  );
}
