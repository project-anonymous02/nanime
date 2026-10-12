export interface ProviderDef {
  name: string;
  active: boolean;
  search: boolean;
  priority: number;
  kind?: 'movie';
  filterLabel?: string;
  desc: string;
}

/** Provider HTML yang diakses langsung dari aplikasi Android. */
export const PROVIDERS: Record<string, ProviderDef> = {
  otakudesu: { name: 'Otakudesu', active: true, search: true, priority: 1, desc: 'Provider utama. Home, search, detail, episode, server, genre, schedule.' },
  oploverz: { name: 'Oploverz', active: true, search: true, priority: 2, desc: 'Provider alternatif. Home, search, detail, episode dengan streamingUrl langsung.' },
  kuramanime: { name: 'Kuramanime', active: true, search: false, priority: 3, desc: 'Provider alternatif. Home, detail, episode, properties (genre/season/studio).' },
  samehadaku: { name: 'Samehadaku', active: false, search: false, priority: 4, desc: 'Status: OFF. Tidak tersedia saat ini.' },
  kusonime: {
    name: 'Kusonime',
    active: true,
    search: true,
    priority: 5,
    kind: 'movie',
    filterLabel: 'Movie',
    desc: 'Sumber anime movie. Home, search, detail dan tautan unduh; pemutaran memakai provider streaming lain.'
  }
};

export const isMovieSource = (id: string) => !!(PROVIDERS[id] && PROVIDERS[id].kind === 'movie');
export const searchLabel = (id: string) => (PROVIDERS[id] && (PROVIDERS[id].filterLabel || PROVIDERS[id].name)) || id;

export const TTL = {
  home: 600000,
  search: 300000,
  detail: 1800000,
  episode: 360000,
  genre: 3600000,
  schedule: 900000
};

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', path: '#/home', icon: 'home' },
  { id: 'search', label: 'Search', path: '#/search', icon: 'search' },
  { id: 'explore', label: 'Explore', path: '#/explore', icon: 'explore' },
  { id: 'schedule', label: 'Jadwal', path: '#/schedule', icon: 'cal' },
  { id: 'favorite', label: 'Favorite', path: '#/favorite', icon: 'heart' },
  { id: 'history', label: 'History', path: '#/history', icon: 'clock' },
  { id: 'stats', label: 'Statistik', path: '#/stats', icon: 'chart' }
];

export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
