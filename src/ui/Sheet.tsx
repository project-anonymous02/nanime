import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { Button } from './Button';

/** Bottom sheet & modal — dirender lewat portal, mengunci gulir latar. */

/**
 * Lifecycle materialize (motion.md §5): mount → open → close → unmount.
 * - open=true: mount, lalu double-rAF → visible (blur+scale+opacity bersama).
 * - open=false: visible=false (exit 300ms, path sama), lalu unmount.
 * - interrupt: re-open sebelum timer habis membatalkan unmount (transition
 *   interruptible, bukan keyframes), sesuai §3.
 * Return: mounted = elemen ada di DOM, visible = kelas hn-open aktif.
 */
export function useMaterialize(open: boolean): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const mountedRef = useRef(open);
  const visibleRef = useRef(open);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number[]>([]);
  useLayoutEffect(() => {
    const clearTimers = () => {
      if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
      rafRef.current.forEach(id => cancelAnimationFrame(id));
      rafRef.current = [];
    };
    if (open) {
      clearTimers();
      if (!mountedRef.current) { mountedRef.current = true; setMounted(true); }
      if (!visibleRef.current) {
        const start = () => { visibleRef.current = true; setVisible(true); };
        if (typeof requestAnimationFrame === 'function') {
          const r1 = requestAnimationFrame(() => {
            const r2 = requestAnimationFrame(start);
            rafRef.current.push(r2);
          });
          rafRef.current.push(r1);
        } else {
          const t = window.setTimeout(start, 0);
          rafRef.current.push(t as unknown as number);
        }
      }
      return clearTimers;
    }
    if (mountedRef.current) {
      visibleRef.current = false;
      setVisible(false);
      const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timerRef.current = window.setTimeout(() => {
        mountedRef.current = false;
        setMounted(false);
        timerRef.current = null;
      }, reduced ? 200 : 300);
    }
    return clearTimers;
  }, [open]);
  return { mounted, visible };
}

function useLock(mounted: boolean, onClose: () => void) {
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mounted, onClose]);
}

export function Sheet({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { mounted, visible } = useMaterialize(open);
  useLock(mounted, onClose);
  if (!mounted) return null;
  return createPortal(
    <>
      <div className={`hn-sheetmask${visible ? ' hn-open' : ''}`} onClick={onClose} />
      <div className={`hn-sheet${visible ? ' hn-open' : ''}`} data-lg-role="dock" role="dialog" aria-modal="true" aria-label={title}>
        <span className="hn-sheetgrip" />
        {title ? <div className="hn-sheethead"><span className="hn-sheettitle">{title}</span></div> : null}
        {children}
      </div>
    </>,
    document.body
  );
}

export function SheetItem({
  icon,
  danger,
  onClick,
  children
}: {
  icon?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="hn-menuitem" onClick={onClick} style={danger ? { color: 'var(--accent-red)' } : undefined}>
      {icon}
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { mounted, visible } = useMaterialize(open);
  useLock(mounted, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className={`hn-sheetmask${visible ? ' hn-open' : ''}`} onClick={onClose} style={{ alignItems: 'center' }}>
      <div className={`hn-sheet${visible ? ' hn-open' : ''}`} data-lg-role="focus" style={{ borderRadius: '22px', margin: '0 18px' }} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        {title ? <div className="hn-sheethead"><span className="hn-sheettitle">{title}</span></div> : null}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Hapus',
  danger = true
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="hn-state-sub" style={{ maxWidth: '100%', padding: '6px 16px 2px' }}>{message}</p>
      <div className="hn-formactions" style={{ padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <Button variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

export function PhotoModal({
  open,
  onClose,
  url
}: {
  open: boolean;
  onClose: () => void;
  url: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Foto Profil">
      <div style={{ padding: '0 16px calc(16px + env(safe-area-inset-bottom))' }}>
        {url ? <img src={url} alt="Foto profil" style={{ width: '100%', borderRadius: '12px', marginBottom: 14 }} /> : null}
        <Button
          variant="ghost"
          icon={<Icon name="external" size={18} />}
          onClick={() => {
            onClose();
            if (url) window.open(url, '_blank', 'noopener');
          }}
        >
          Buka di tab baru
        </Button>
      </div>
    </Modal>
  );
}
