export type ApiSource = 'wajik' | 'kusonime';

export interface ProviderDef {
  name: string;
  active: boolean;
  search: boolean;
  priority: number;
  kind?: 'movie';
  filterLabel?: string;
  desc: string;
}

/**
 * Daftar provider aplikasi.
 * - wajik    : otakudesu / oploverz / kuramanime (apis/wajik-anime-api)
 * - kusonime : sumber film (apis/Kusonime-API)
 */
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
    desc: 'Sumber anime movie terpisah (apis/Kusonime-API). Home, search, detail. Tidak punya stream sendiri — tombol Tonton Film mencari provider lain yang mendukung streaming.'
  }
};

export const isMovieSource = (id: string) => !!(PROVIDERS[id] && PROVIDERS[id].kind === 'movie');
export const searchLabel = (id: string) => (PROVIDERS[id] && (PROVIDERS[id].filterLabel || PROVIDERS[id].name)) || id;

/**
 * Kandidat base URL per sumber API — tanpa konfigurasi manual.
 * P urutan: same-origin (deployment yang menyemat API di origin yang sama)
 * lalu instance publik resmi. Pemenangnya di-cache di localStorage dan
 * otomatis dirotasi kalau gagal, jadi pengguna tidak pernah mengurus URL.
 */
export const API_CANDIDATES: Record<ApiSource, string[]> = {
  wajik: ['', 'https://wajik-anime-api.vercel.app'],
  kusonime: ['', 'https://kusonime-api.vercel.app']
};

export const API_PROBE: Record<ApiSource, string> = {
  wajik: '/otakudesu/ongoing?page=1',
  kusonime: '/api/search/?s=a'
};

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
