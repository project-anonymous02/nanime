import { useUI } from '../state/ui';
import { Icon } from './icons';

/** Tumpukan toast global — tidak pernah memblokir layar. */
export function Toasts() {
  const toasts = useUI(s => s.toasts);
  const dismiss = useUI(s => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <button
          key={t.id}
          type="button"
          className={'toast ' + (t.kind === 'err' ? 'err' : t.kind === 'ok' ? 'ok' : '')}
          onClick={() => dismiss(t.id)}
        >
          <Icon name={t.kind === 'err' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={18} />
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
