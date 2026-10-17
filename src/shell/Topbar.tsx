import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark, Icon } from '../ui/icons';
import { useScrolled } from '../ui/hooks';

/** Bilah atas standar: kembali, judul/kunci merek, dan aksi kanan. */
export function Topbar({
  title,
  back,
  onBack,
  right
}: {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  const scrolled = useScrolled(4);
  return (
    <header className={'topbar' + (scrolled ? ' scrolled' : '')}>
      {back ? (
        <button
          type="button"
          className="ibtn ripple-host"
          aria-label="Kembali"
          onClick={() => (onBack ? onBack() : navigate(-1))}
        >
          <Icon name="back" />
        </button>
      ) : null}
      {title ? (
        <h1 className="tb-title">{title}</h1>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <BrandMark size={30} />
          <span className="tb-title">Nanime</span>
        </span>
      )}
      <span className="tb-spacer" />
      {right}
    </header>
  );
}
