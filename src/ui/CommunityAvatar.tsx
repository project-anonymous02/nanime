import { useEffect, useState } from 'react';

/** Avatar komunitas: foto atau inisial berwarna. */
export function CommunityAvatar({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = name.trim().charAt(0).toLocaleUpperCase() || 'N';
  const hue = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return (
    <span
      className={`hn-avatar hn-avatar-sm${failed || !src ? ' hn-avatar-fallback' : ''}`}
      style={{ background: `hsl(${hue} 42% 26%)`, color: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0, display: failed || !src ? 'grid' : 'grid', placeItems: 'center', fontWeight: 700 }}
      aria-hidden="true"
    >
      <span className="hn-avatar-fallback" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{initial}</span>
      {src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} /> : null}
    </span>
  );
}
