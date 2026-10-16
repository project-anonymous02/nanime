import { allProviders } from '../providers/registry';

export interface ProviderDef {
  name: string;
  active: boolean;
  search: boolean;
  priority: number;
  kind?: 'movie';
  filterLabel?: string;
  desc: string;
  /** true bila provider unduhan tanpa server streaming. */
  downloadOnly?: boolean;
  /** Kategori konten bila tersedia. */
  content?: 'anime' | 'donghua';
}

/** Metadata provider HTML yang diakses langsung dari aplikasi Android (sumber kebenaran: registry). */
export const PROVIDERS: Record<string, ProviderDef> = (() => {
  const out: Record<string, ProviderDef> = {};
  for (const p of allProviders()) {
    out[p.id] = {
      name: p.name,
      active: p.active,
      search: p.searchable,
      priority: p.priority,
      desc: p.desc,
      downloadOnly: p.movieOnly || p.downloadOnly || undefined,
      content: p.content,
      kind: p.movieOnly && p.id === 'kusonime' ? 'movie' : undefined,
      filterLabel: p.id === 'kusonime' ? 'Movie' : p.content === 'donghua' ? 'Donghua' : undefined
    };
  }
  return out;
})();

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

/** Navigasi bawah: 5 tab utama. */
export const NAV: NavItem[] = [
  { id: 'home', label: 'Beranda', path: '#/home', icon: 'home' },
  { id: 'explore', label: 'Jelajahi', path: '#/explore', icon: 'explore' },
  { id: 'search', label: 'Cari', path: '#/search', icon: 'search' },
  { id: 'library', label: 'Library', path: '#/library', icon: 'heart' },
  { id: 'profile', label: 'Profil', path: '#/profile', icon: 'user' }
];

export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
