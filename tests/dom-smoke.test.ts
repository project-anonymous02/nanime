// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from '../src/App';
import { useAuth } from '../src/state/auth';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function waitFor(fn: () => void, ms = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() - start > ms) throw e;
      await act(async () => {
        await sleep(30);
      });
    }
  }
}

async function goto(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

const SOURCE_NAMES = /otakudesu|samehadaku|animeku|nekopoi/i;

let root: Root | null = null;
let container: HTMLElement;

beforeAll(async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline test')));
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(HashRouter, null, createElement(App)));
  });
  await waitFor(() => {
    expect(container.textContent).toContain('Nanime');
  });
});

afterAll(async () => {
  await act(async () => {
    root?.unmount();
  });
  vi.unstubAllGlobals();
});

describe('smoke test aplikasi React', () => {
  it('gerbang masuk tampil sebelum ada sesi (tanpa navigasi bawah)', () => {
    expect(container.querySelector('.bottom-nav')).toBeNull();
    expect(container.textContent).toContain('WELCOME');
    expect(container.textContent).toContain('Geser ke atas');
  });

  it('setelah masuk, shell & navigasi bawah tampil', async () => {
    await act(async () => {
      useAuth.setState({
        ready: true,
        signedIn: true,
        user: { id: 'u1', email: 'tester@nanime.test', name: 'Tester', avatar: null }
      });
    });
    await waitFor(() => {
      expect(container.querySelector('.bottom-nav')).not.toBeNull();
      const text = container.textContent || '';
      expect(text).toContain('Home');
      expect(text).toContain('Jadwal');
      expect(text).toContain('Subscribed');
      expect(text).toContain('Riwayat');
      expect(text).toContain('SocialLine');
      expect(container.querySelector('[aria-label="Buka profil"]')).not.toBeNull();
    });
  });

  it('beranda menampilkan galat umum saat jaringan mati — tanpa nama sumber', async () => {
    await waitFor(() => {
      expect(container.textContent).toContain(
        'Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti.'
      );
    });
    expect(container.textContent).not.toMatch(SOURCE_NAMES);
  });

  it('rute pengaturan & riwayat render', async () => {
    await goto('#/settings');
    await waitFor(() => {
      expect(container.textContent).toContain('Pengaturan');
    });

    await goto('#/history');
    await waitFor(() => {
      expect(container.textContent).toContain('Riwayat');
    });
    expect(container.textContent).not.toMatch(SOURCE_NAMES);
  });

  it('rute Public Chat tampil sebagai layar penuh tanpa bottom nav', async () => {
    await goto('#/public-chat');
    await waitFor(() => {
      expect(container.querySelector('.public-chat-page')).not.toBeNull();
      expect(container.textContent).toContain('Public Chat');
    });
    expect(container.querySelector('.bottom-nav')).toBeNull();
  });

  it('rute peringkat anime dan pengguna terbuka dari navigasi leaderboard', async () => {
    await goto('#/ranking/anime');
    await waitFor(() => expect(container.textContent).toContain('Peringkat Anime'));
    expect(container.querySelector('.bottom-nav')).toBeNull();
    await goto('#/leaderboard');
    await waitFor(() => expect(container.textContent).toContain('Top Pengguna'));
    expect(container.querySelector('.bottom-nav')).toBeNull();
  });

  it('rute Nobar Nanime menampilkan alur buat atau gabung room', async () => {
    await goto('#/watch-party');
    await waitFor(() => {
      expect(container.textContent).toContain('Nobar bareng');
      expect(container.textContent).toContain('Gabung Nobar');
    });
    expect(container.querySelector('[aria-label="Masukkan kode room"]')).toBeNull();
    expect(container.querySelector('#watch-party-code')).not.toBeNull();
  });

  it('halaman AniGames Nanime menyediakan hub Crystal dan clan', async () => {
    await goto('#/games');
    await waitFor(() => {
      expect(container.textContent).toContain('Permainan & Clan');
      expect(container.textContent).toContain('CRYSTAL NANIME');
    });
  });

  it('halaman Afinitas Nanime menampilkan kegagalan layanan dengan retry', async () => {
    await goto('#/affinity');
    await waitFor(() => {
      expect(container.textContent).toContain('Bangun ikatan, selesaikan misi, dan kumpulkan XP bersama teman.');
      expect(container.textContent).toContain('Coba lagi');
    });
    expect(container.querySelector('.affinity-page')).not.toBeNull();
    expect(container.querySelector('[aria-label="Cari teman untuk Afinitas"]')).toBeNull();
    expect(container.querySelector('[aria-label="Privasi Afinitas"]')).toBeNull();
  });

  it('rute profil publik Nanime menampilkan error dan retry dari layanan akun', async () => {
    await goto('#/profile/00000000-0000-0000-0000-000000000001');
    await waitFor(() => {
      expect(container.textContent).toContain('Profil publik dan koneksi komunitas.');
      expect(container.textContent).toContain('Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.');
      expect(container.textContent).toContain('Coba lagi');
    });
  });

  it('rute tak dikenal dialihkan kembali ke beranda', async () => {
    await goto('#/rute-tidak-ada');
    await waitFor(() => {
      expect(container.textContent).toContain('Home');
    });
    expect(container.querySelector('.bottom-nav')).not.toBeNull();
  });

  it('rute pemutar lama tidak membuka pemutar dan diarahkan ke beranda', async () => {
    await goto('#/watch/anime-uji/1');
    await waitFor(() => expect(container.textContent).toContain('Home'));
    expect(container.querySelector('video, iframe')).toBeNull();
    expect(container.querySelector('.bottom-nav')).not.toBeNull();
  });
});
