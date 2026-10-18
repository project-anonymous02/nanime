import type { ReactNode, SVGProps } from 'react';

/**
 * Sistem ikon baru (React) — semua glyph garis 24×24, stroke mengikuti warna teks.
 * Tidak ada dependensi eksternal; path ditulis tangan agar seragam.
 */

const P: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 10.4 12 3l9 7.4" />
      <path d="M5 9.6V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </>
  ),
  chat: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3.5 2v-5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 11h8M8 14.5h5" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z" />
      <path d="m10.1 13.9 4.2-4.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.6" />
      <path d="M3.5 10h17M8 3.2v3.4M16 3.2v3.4" />
    </>
  ),
  heart: <path d="M12 20.5s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.7c0 5.2-7.5 9.8-7.5 9.8z" />,
  heartFill: (
    <path
      d="M12 20.5s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.7c0 5.2-7.5 9.8-7.5 9.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  history: (
    <>
      <path d="M3.4 8.2V3.8M3.4 8.2h4.4M4.1 7.6a8.9 8.9 0 1 1-.6 7" />
      <path d="M12 7.3v5l3.4 2.1" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.4" r="3.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="4" />
      <path d="M4.8 20.4a7.4 7.4 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5a3.5 3.5 0 0 1 0 6.8M17 14a5.2 5.2 0 0 1 4.2 5.1" />
    </>
  ),
  unlock: <><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.4-2" /></>,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  bellFill: (
    <>
      <path
        d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="3.6" y="3.6" width="7" height="7" rx="1.6" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="1.6" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="1.6" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="1.6" />
    </>
  ),
  play: <path d="M7 4.8v14.4a.7.7 0 0 0 1.07.6l11.4-7.2a.7.7 0 0 0 0-1.2L8.07 4.2A.7.7 0 0 0 7 4.8z" fill="currentColor" stroke="none" />,
  pause: <path d="M8.5 4.8h2.6v14.4H8.5zM13 4.8h2.6v14.4H13z" fill="currentColor" stroke="none" />,
  back: <path d="M15 18l-6-6 6-6" />,
  right: <path d="m9 6 6 6-6 6" />,
  left: <path d="m15 6-6 6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  up: <path d="m6 15 6-6 6 6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  reply: <path d="M9 8 4 12l5 4v-3h4.2a5.8 5.8 0 0 1 5.8 5.8V20a7.8 7.8 0 0 0-7.8-7.8H9z" />,
  check: <path d="m5 12.6 4.6 4.6L19 7.6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.75l5.9-.85z" />,
  starFill: (
    <path
      d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.75l5.9-.85z"
      fill="currentColor"
      stroke="none"
    />
  ),
  crown: <path d="m3 8 4.4 3.2 4.6-6 4.6 6L21 8l-2.1 11H5.1L3 8Z" fill="currentColor" stroke="none" />,
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.4" />
      <path d="M7 4v16M17 4v16M3 12h18" />
    </>
  ),
  subscribed: (
    <>
      <path d="M7 3.2h10M4.7 6h14.6" />
      <rect x="4" y="8.2" width="16" height="12.3" rx="2.2" fill="currentColor" stroke="none" />
      <path d="m10 10.7 5.8 3.6-5.8 3.6z" fill="#17191f" stroke="none" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M3.4 9.6h17.2M3.4 14.4h17.2" />
      <path d="M12 3.2c-2.6 2.5-3.9 5.4-3.9 8.8s1.3 6.3 3.9 8.8c2.6-2.5 3.9-5.4 3.9-8.8s-1.3-6.3-3.9-8.8z" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 8.6v4.6M12 16.6h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 11v5.4M12 7.8h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.4 11a8.4 8.4 0 1 0-.7 4.6" />
      <path d="M20.8 5.6v5.6h-5.6" />
    </>
  ),
  trash: <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 0 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.6 1.6 0 0 0 8.9 20.6h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2.2" />
      <rect x="3" y="13" width="18" height="7" rx="2.2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  fullscreen: <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />,
  volume: (
    <>
      <path d="M4 9.6h3.2L12 5.4v13.2l-4.8-4.2H4z" />
      <path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2M18 7a7 7 0 0 1 0 10" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.6h3.2L12 5.4v13.2l-4.8-4.2H4z" />
      <path d="m16 9.8 4.4 4.4M20.4 9.8 16 14.2" />
    </>
  ),
  skipNext: (
    <>
      <path d="m6 5 9 7-9 7z" fill="currentColor" stroke="none" />
      <path d="M16.6 5h2.4v14h-2.4z" fill="currentColor" stroke="none" />
    </>
  ),
  seekBack: (
    <>
      <path d="m11 6-6 6 6 6" />
      <path d="m18 6-6 6 6 6" />
    </>
  ),
  seekFwd: (
    <>
      <path d="m6 6 6 6-6 6" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M12 18.4h.01" />
      <path d="M8.5 15.3a5 5 0 0 1 7 0" />
      <path d="M5 12a10 10 0 0 1 14 0" />
      <path d="m3 3 18 18" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z" />
      <path d="M19 15.5v3M17.5 17h3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  logout: (
    <>
      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path d="M9 12h11" />
      <path d="m17 9 3 3-3 3" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </>
  ),
  edit: (
    <>
      <path d="m14.5 5.5 4 4L7 21H3v-4z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l1.8 2.2h8A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  socialLine: (
    <>
      <path d="m3 18 6-6 4 3 8-9" />
      <circle cx="3" cy="18" r="1.3" fill="currentColor" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" />
      <circle cx="13" cy="15" r="1.3" fill="currentColor" />
      <circle cx="21" cy="6" r="1.3" fill="currentColor" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z" />
      <circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12.5" rx="2.5" />
      <path d="M9 21h6M12 17.5V21" />
    </>
  ),
  shield: <path d="M12 3 5 5.8v5.4c0 4.4 3 8.2 7 9.8 4-1.6 7-5.4 7-9.8V5.8z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m4 4 16 16" />
      <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.2 0 2.3-.25 3.3-.65" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2.4" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m5 19 5.5-5.5L14 17l3-3 3.5 3.5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  sort: (
    <>
      <path d="M7 4v13M3.5 13.5 7 17l3.5-3.5" />
      <path d="M13 7h8M13 12h6M13 17h4" />
    </>
  ),
  trending: (
    <>
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M16 6h5v5" />
    </>
  ),
  bookmark: <path d="M6 4.5h12V21l-6-4-6 4z" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.6" cy="8.6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="15.4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>
  ),
  restore: (
    <>
      <path d="M4 10a8 8 0 1 1 2.3 6.3" />
      <path d="M4 4v5.6h5.6" />
    </>
  ),
  userMinus: (
    <>
      <circle cx="10" cy="8.2" r="4" />
      <path d="M3 20.4a7.4 7.4 0 0 1 14 0" />
      <path d="M16.5 11h5" />
    </>
  ),
  tvPlay: (
    <>
      <rect x="3" y="5" width="18" height="12.5" rx="2.5" />
      <path d="m10.5 8.6 4.4 2.65-4.4 2.65z" fill="currentColor" stroke="none" />
      <path d="M9 21h6" />
    </>
  ),
  downloadCloud: (
    <>
      <path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18.2 9.6 4 4 0 0 1 17.5 18H17" />
      <path d="M12 12v7" />
      <path d="m9 16 3 3 3-3" />
    </>
  ),
  skipPrev: (
    <>
      <path d="m18 5-9 7 9 7z" fill="currentColor" stroke="none" />
      <path d="M5 5h2.4v14H5z" fill="currentColor" stroke="none" />
    </>
  ),
  brightness: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </>
  ),
  expand: <path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5V9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15M9.5 9.5l-4-4M14.5 9.5l4-4M14.5 14.5l4 4M9.5 14.5l-4 4" />,
  collapse: <path d="M4 9h3.5A1.5 1.5 0 0 0 9 7.5V4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M9 20v-3.5A1.5 1.5 0 0 0 7.5 15H4" />,
  speed: (
    <>
      <path d="M5.6 18.4a8.8 8.8 0 1 1 12.8 0" />
      <path d="m12 13.6 3.6-3.6" />
      <circle cx="12" cy="14.6" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.6" />
      <rect x="12.2" y="11.4" width="6.6" height="4.8" rx="1.4" fill="currentColor" stroke="none" />
    </>
  )
};

export type IconName = keyof typeof P;

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 1.9, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}

export function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Logo aplikasi Nanime — memakai aset resmi `logo.jpg` dari folder public. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src={import.meta.env.BASE_URL + 'logo.jpg'}
      width={size}
      height={size}
      alt="Nanime"
      draggable={false}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    />
  );
}
