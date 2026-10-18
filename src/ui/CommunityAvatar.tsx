import { useEffect, useState } from 'react';

export function CommunityAvatar({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = name.trim().charAt(0).toLocaleUpperCase() || 'N';
  return <span className="community-avatar" aria-hidden="true">{initial}{src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null}</span>;
}
