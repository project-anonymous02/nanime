import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './icons';
import { resolveAnimeImages } from '../core/services/ImageResolver';

export interface SmartImageProps {
  src?: string;
  animeId?: string;
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
export function SmartImage({ src, animeId, alt, className = '', style, eager, fallback = 'film', children }: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const fallbackRequested = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = candidates[index] || (index === 0 ? src || '' : '');

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setIndex(0);
    fallbackRequested.current = false;
    const primary = validImageUrl(src);
    setCandidates(primary ? [primary] : []);
    if (!primary && animeId) {
      const resolve = () => {
        fallbackRequested.current = true;
        void resolveAnimeImages(animeId).then(images => {
          if (live) setCandidates(unique(images));
        });
      };
      const node = containerRef.current;
      if (node && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); resolve(); }
        }, { rootMargin: '300px' });
        observer.observe(node);
        return () => { live = false; observer.disconnect(); };
      }
      resolve();
    }
    return () => { live = false; };
  }, [src, animeId]);
  const show = !!current;

  return (
    <div ref={containerRef} className={'smart-img ' + (loaded || !show ? '' : 'skel ') + className} style={style}>
      {show ? (
        <img
          key={current}
          src={current}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className={loaded ? 'loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            if (index + 1 < candidates.length) {
              setIndex(i => i + 1);
              return;
            }
            if (animeId && !fallbackRequested.current) {
              fallbackRequested.current = true;
              void resolveAnimeImages(animeId).then(images => {
                setCandidates(unique([validImageUrl(src), ...images].filter(Boolean)));
                setIndex(1);
              });
              return;
            }
            setIndex(i => i + 1);
          }}
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

function validImageUrl(value?: string): string {
  const url = String(value || '').trim();
  if (!url || /^(data:|javascript:)/i.test(url)) return '';
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
