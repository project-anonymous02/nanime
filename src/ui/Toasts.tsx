import { useUI } from '../state/ui';
import { Icon } from './icons';

/** Tumpukan toast global — tidak pernah memblokir layar. */
export function Toasts() {
  const toasts = useUI(s => s.toasts);
  const dismiss = useUI(s => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="hn-toastwrap" aria-live="polite">
      {toasts.map(t => (
        <button
          key={t.id}
          type="button"
          className={`hn-toast${t.kind === 'ok' ? ' hn-ok' : t.kind === 'err' ? ' hn-err' : ''}`}
          onClick={() => dismiss(t.id)}
        >
          <Icon name={t.kind === 'err' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={16} />
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
