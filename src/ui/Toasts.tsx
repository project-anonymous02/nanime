import { useUI } from '../state/ui';
import { Icon } from './icons';
import { LiquidGlass } from './liquid-glass';

/** Tumpukan toast global — tidak pernah memblokir layar. */
export function Toasts() {
  const toasts = useUI(s => s.toasts);
  const dismiss = useUI(s => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="hn-toastwrap" data-lg-role="rail" aria-live="polite">
      {toasts.map(t => (
        <LiquidGlass
          key={t.id}
          as="button"
          type="button"
          className={`hn-toast${t.kind === 'ok' ? ' hn-ok' : t.kind === 'err' ? ' hn-err' : ''}`}
          profile="thin"
          radius={14}
          strength={115}
          dispersion={0.02}
          interactive
          onClick={() => dismiss(t.id)}
        >
          <Icon name={t.kind === 'err' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={16} />
          <span>{t.text}</span>
        </LiquidGlass>
      ))}
    </div>
  );
}
