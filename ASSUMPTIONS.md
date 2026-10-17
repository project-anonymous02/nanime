# ASSUMPTIONS — Nanime v2 (Reinkarnasi)

Asumsi yang diambil selama pengerjaan. Bila salah satu berubah, kode terkait
perlu disesuaikan.

## 1. Referensi visual AnibiPlay

- APK/screenshot AnibiPlay v1.4.9 build 47 **tidak tersedia** di lingkungan
  pengembangan. UI dibangun dari design token (`src/styles/tokens.css`) dan
  deskripsi spesifikasi: dark `#0E0F14`, aksen biru `#2563EB`, gold `#F5C518`,
  radius 16–20px, font Inter, easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- Animasi hanya `transform`/`opacity`; saat scroll cepat animasi masuk
  dimatikan (`html[data-scrolling='1']`). Bila screenshot referensi tersedia,
  sesuaikan token — bukan struktur komponen.

## 2. Supabase & login Google

- Default proyek: `https://zueplyqfvjtnpvhaivkx.supabase.co`; bisa ditimpa via
  `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, lihat
  `.env.example`). Publishable key aman di klien — keamanan bergantung penuh
  pada RLS (`supabase/migrations/001_init.sql`).
- Google OAuth harus diaktifkan di dashboard Supabase, dengan redirect URL:
  - Web: `https://<domain-anda>/#/auth/callback`
  - APK: `nanime://auth-callback`
- Auth memakai PKCE + `detectSessionInUrl`; deep link APK ditangani
  `@capacitor/app` (`src/lib/deeplink.ts`).
- Tanpa sesi, aplikasi **tidak menampilkan konten** (tanpa mode tamu).

## 3. Provider & pengambilan data

- Akses halaman sumber dari **browser** bisa diblokir CORS; APK memakai
  `CapacitorHttp` bawaan perangkat (`src/core/http.ts`). Tidak ada backend
  scraper/proxy.
- Urutan prioritas 19 provider ada di `src/providers/registry.ts`; **Anoboy
  selalu terakhir**; `moenime`/`alqanime`/`animekuonline` hanya sumber unduhan.
  Daftar lengkap: `PROVIDERS.md`.
- Struktur halaman sumber dapat berubah sewaktu-waktu; setiap provider punya
  adapter sendiri (`src/providers/*.ts`). Kegagalan satu provider tidak
  menghentikan yang lain (fallback diam-diam, 8 detik per percobaan).
- Kualitas stream dinormalisasi paksa menjadi 4 slot (1080p/720p/480p/360p);
  slot tanpa sumber eksplisit meminjam kualitas terdekat dengan penanda
  `approx` — tidak pernah menampilkan teks "tidak tersedia".

## 4. Cache & penyimpanan

- Cache 3 lapisan (memori → IndexedDB → jaringan), LRU 50MB, TTL per jenis data
  (`src/core/services/CacheManager.ts`).
- Di lingkungan tes Node, `indexedDB` tidak ada sehingga lapisan IndexedDB
  menjadi no-op; di browser/APK berfungsi normal.
- State pengguna: `nanime.v2.app` (onboarded, mode), `nanime.v2.settings`,
  `nanime.v2.library` (favorit, riwayat, tombstone). Sinkron server memakai
  strategi last-write-wins per baris + tombstone anti-muncul-kembali.

## 5. Pemutar global V3 (Floating Mini Player)

- Video hidup di SATU elemen `<video>` persisten milik `GlobalPlayer`
  (`src/player/GlobalPlayer.tsx`) yang di-mount di `src/App.tsx` **di luar
  `<Routes>`**; berpindah halaman hanya mengubah mode tampilan
  (`.gp-docked` ⇄ `.gp-floating`), playback tidak pernah di-reset.
- "PiP" di sini adalah mini player **di dalam aplikasi** (z-index 9999, di atas
  semua UI). Saat tab/aplikasi disembunyikan, `requestPictureInPicture` OS
  dicoba best-effort (didukung Chrome/Edge dan WebView modern; gagal senyap di
  peramban tanpa dukungan).
- Animasi docked ⇄ floating memakai Web Animations API (`Element.animate`)
  dengan kurva `cubic-bezier(0.22, 1, 0.36, 1)`; bila API tidak ada (mis. jsdom
  saat tes) animasi dilewati, bukan error.
- Ikon aplikasi memakai aset resmi `public/logo.jpg` (bukan emoji/SVG). Teks
  "Developer: Nata" tampil di layar masuk sesuai permintaan spesifikasi.
- Ada jeda singkat pada tap floating (±250ms) untuk membedakan tap vs
  double-tap — standar pemutar serupa.

## 6. Fitur lama yang dipensiunkan

Mengikuti spesifikasi reinkarnasi, modul lama berikut **tidak** dibawa ke v2 dan
file fisiknya di-stub (isi dikosongkan, file tetap ada):

- `src/app.ts`, `src/main.ts` (diganti `src/main.tsx` + `src/App.tsx`)
- `src/views/*.ts`, `src/ui/{components,dom,nav,sheet,toast}.ts`,
  `src/core/{router,store,api,config,icons,movies}.ts`
- `src/sync/*`, `src/features/*`, `src/metadata/*` (metadata AniList/Kitsu,
  ekspor/impor, PWA, notifikasi, shortcut tidak ada di spesifikasi v2)
- `src/__shot__/*` (mock screenshot lokal) dan stylesheet lama
  (`card/detail/features/hero/index/layout/panels/responsive/wibuku.css`)

Fitur ekspor/impor data dan PWA dihapus karena tidak diminta pada spesifikasi
v2; penyimpanan data pengguna sepenuhnya ditangani Supabase + state lokal.

## 7. Lingkungan

- Node `>=22.22.2` (lihat `package.json`).
- Tes: Vitest dengan environment `node` (default) dan `jsdom` khusus smoke test;
  `tests/setup.ts` menyediakan polyfill minimal (localStorage, observer, matchMedia).
- Build APK CI membutuhkan `ANDROID_GOOGLE_SERVICES_JSON` (base64) untuk
  Firebase; tanpa secret tersebut build tetap jalan tanpa Firebase.
- Font Inter diambil dari CDN jsDelivr di `index.html`; offline penuh akan
  memakai font sistem.
