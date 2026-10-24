import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'danger' | 'white' | 'ghost' | 'plain';

const VARIANTS: Record<Variant, string> = {
  primary: 'hn-btn',
  outline: 'hn-ghostbtn',
  danger: 'hn-btn hn-dangerbtn',
  white: 'hn-btn',
  ghost: 'hn-ghostbtn',
  plain: 'hn-textbtn'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'lg' | '';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

/** Tombol serba bisa dengan status memuat (design system hn-). */
export function Button({
  variant = 'primary',
  size = '',
  block,
  loading,
  icon,
  children,
  className = '',
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const cls = [
    VARIANTS[variant],
    size === 'sm' ? 'hn-btn-sm' : '',
    block ? 'hn-block' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      style={{ ...(block ? { width: '100%' } : {}), ...(size === 'lg' ? { minHeight: 52, fontSize: 16 } : {}), ...style }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner-sm" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
