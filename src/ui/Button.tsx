import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useRipple } from './hooks';

type Variant = 'primary' | 'outline' | 'danger' | 'white' | 'ghost' | 'plain';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'lg' | '';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

/** Tombol serba bisa dengan ripple + status memuat. */
export function Button({
  variant = 'primary',
  size = '',
  block,
  loading,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const ripple = useRipple<HTMLButtonElement>();
  const cls = [
    'btn',
    variant === 'plain' ? '' : variant,
    size,
    block ? 'block' : '',
    loading ? 'loading' : '',
    'ripple-host',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={cls} disabled={disabled || loading} onPointerDown={ripple} {...rest}>
      {loading ? <span className="btn-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
