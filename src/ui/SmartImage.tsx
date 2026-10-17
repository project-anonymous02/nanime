import { useState, type CSSProperties } from 'react';
import { Icon } from './icons';

export interface SmartImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
  fallback?: 'film' | 'image' | 'user';
  children?: React.ReactNode;
}

/**
 * Gambar dengan placeholder berkilau, fade-in saat termuat, dan fallback ikon
 * bila gagal — tidak pernah menyisakan kotak rusak.
 */
export function SmartImage({ src, alt, className = '', style, eager, fallback = 'film', children }: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const show = !!src && !error;

  return (
    <div className={'smart-img ' + (loaded || !show ? '' : 'skel ') + className} style={style}>
      {show ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className={loaded ? 'loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <span className="img-fallback">
          <Icon name={fallback === 'user' ? 'user' : fallback === 'image' ? 'image' : 'film'} />
        </span>
      )}
      {children}
    </div>
  );
}
