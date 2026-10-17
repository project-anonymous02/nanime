import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { Button } from './Button';

/** Bottom sheet & modal — dirender lewat portal, mengunci gulir latar. */

function useLock(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);
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
  useLock(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        {title ? <div className="sheet-title">{title}</div> : null}
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
    <button type="button" className="sheet-item ripple-host" onClick={onClick} style={danger ? { color: 'var(--accent-red)' } : undefined}>
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
  useLock(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        {title ? <h3>{title}</h3> : null}
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
      <p>{message}</p>
      <div className="modal-actions">
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
      <div className="photo-modal">
        {url ? <img src={url} alt="Foto profil" style={{ width: '100%', borderRadius: 'var(--r-md)', marginBottom: 14 }} /> : null}
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
