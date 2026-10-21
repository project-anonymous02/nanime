# ASSUMPTIONS — Nanime v2 (Reinkarnasi)

Asumsi yang diambil selama pengerjaan. Bila salah satu berubah, kode terkait
perlu disesuaikan.

## 1. Referensi visual dan APK AniBiPlay

- `/tmp/Anibiplay` tersedia sebagai APK hasil ekstraksi (DEX, manifest biner,
  resource), dan hasil dekompilasi JADX tersedia di `/tmp/Anibiplay-decompiled`
  (`sources/` dan `resources/`). Gunakan hasil dekompilasi ini untuk menelusuri
  pemanggil, model, dan UI; inventaris string DEX saja tidak cukup. Manifest,
  entry activity, serta dukungan PiP telah diperiksa; pemetaan seluruh kelas,
  alur runtime, dan pembandingan perangkat masih berlangsung. Detail layar
  yang diketahui dicatat pada `map-anibiplay.md`.
- Rute API yang ditemukan sebagai string DEX belum dianggap endpoint aktif
  sampai alur pemanggilan dan kontraknya terverifikasi.
- Token Nanime saat ini mengikuti palet gelap biru-hitam dan aksen biru/gold
  pada `src/styles/tokens.css`; kemiripan piksel belum diverifikasi pada
  emulator.

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
- Fitur teman/chat dan Nobar memakai skema Supabase Nanime aditif pada
  `supabase/migrations/006_friends_and_direct_messages.sql` dan
  `supabase/migrations/007_watch_parties.sql`. Migration tersebut perlu
  diterapkan ke proyek Supabase agar pencarian profil, pesan, invite room,
  chat Nobar, sinkronisasi posisi, dan update episode oleh host tersedia.
  Player Nanime membuka episode room lewat resolver katalog dan mengikuti state
  playback peserta untuk sumber media langsung; kontrol player iframe lintas
  origin dibatasi browser. Migration
  `supabase/migrations/008_nanime_games.sql` juga menyiapkan wallet/ledger
  Crystal dan clan Nanime melalui RPC yang dibatasi RLS. Semua migration ini
  belum diterapkan ke proyek Supabase produksi dari workspace ini.

## 3. Provider & pengambilan data

- Akses halaman sumber dari **browser** bisa diblokir CORS; APK memakai
  `CapacitorHttp` bawaan perangkat (`src/core/http.ts`). Tidak ada backend
  scraper/proxy.
- Registry final hanya memuat empat sumber (`src/providers/registry.ts`):
  **Otakudesu** (utama), **Samehadaku** (pelengkap), **Animeku**
  (fallback terakhir), dan **Nekopoi** (jalur pencarian terpisah, opt-in,
  hanya unduhan). Tidak ada provider lain yang dipanggil.
- Pencarian berjalan sekuensial Otakudesu → Samehadaku → Animeku dan berhenti
  pada hasil relevan pertama; fallback detail hanya mengisi bagian yang kosong
  (sinopsis, genre, poster, episode yang hilang) tanpa menimpa data lengkap.
  Nekopoi tidak pernah masuk home/jadwal/rekomendasi/katalog umum.
- Struktur halaman sumber dapat berubah sewaktu-waktu; setiap provider punya
  adapter sendiri (`src/providers/*.ts`). Kegagalan satu provider tidak
  menghentikan yang lain (fallback diam-diam, timeout per percobaan).
- Kualitas stream hanya ditampilkan bila sumber benar-benar menyediakannya;
  tidak ada kualitas yang dikarang. Fallback pemutaran mencari sumber lain
  hanya ketika sumber utama gagal atau 360p tidak tersedia.
- Animeku memakai tema kustom `aku-*` (bukan animestream): detail `/{slug}/`,
  daftar episode di `.aku-eplist`, dan halaman play `/play/…` dengan iframe
  `.aku-layar`. Halaman play tidak menyediakan tautan unduhan.
- Mirror Otakudesu diselesaikan lewat token admin-ajax, lalu URL media langsung
  diekstrak dari halaman embed. Iframe desustream tidak dipakai karena header
  CSP `frame-ancestors` memblokir pemuatan dari origin aplikasi.

## 4. Cache & penyimpanan

- Cache 3 lapisan (memori → IndexedDB → jaringan), LRU 50MB, TTL per jenis data
  (`src/core/services/CacheManager.ts`).
- Di lingkungan tes Node, `indexedDB` tidak ada sehingga lapisan IndexedDB
  menjadi no-op; di browser/APK berfungsi normal.
- State pengguna: `nanime.v2.app` (onboarded, mode), `nanime.v2.settings`,
  `nanime.v2.library` (favorit, riwayat, tombstone). Sinkron server memakai
  strategi last-write-wins per baris + tombstone anti-muncul-kembali.

## 5. Pemutar global

- `PlayerOverlay` dipasang oleh `src/shell/Shell.tsx` dan mengelola sesi pada
  `src/state/player.ts`. Elemen media tetap terpasang saat route berubah serta
  mode mini/full berubah; pemutar mini dapat digeser di dalam aplikasi.
- Android system Picture-in-Picture kini diaktifkan untuk sesi direct-media
  Nanime melalui Capacitor plugin `PictureInPicture`, `MainActivity` dan flag
  `supportsPictureInPicture`; ketika masuk PiP, shell menyembunyikan chrome.
  Dukungan tampilannya tetap bergantung pada Android/WebView dan tidak dapat
  diverifikasi di emulator pada environment ini. Untuk embed lintas-origin,
  sistem PiP tidak dapat mengambil alih kontrol media milik embed; mini player
  internal tetap tersedia.
- Preferensi autoplay, skip intro, kualitas, dan kontrol brightness/volume
  berasal dari `UserSettings`; tombol UI dan dukungan gerak pada media langsung
  memakai state ini. Embed eksternal tidak mengizinkan kontrol volumenya dari
  aplikasi.
- Ikon aplikasi memakai aset resmi `public/logo.jpg` (bukan emoji/SVG). Teks
  "Developer: Nata" tampil di layar masuk sesuai permintaan spesifikasi.
- Ada jeda singkat pada tap floating (±250ms) untuk membedakan tap vs
  double-tap — standar pemutar serupa.
- Rute `/profile/:userId` hanya menampilkan field publik dari RPC
  `get_public_profiles`; library favorites/history tidak dibagikan. Permintaan
  pertemanan dan chat memakai backend Nanime beserta RLS migrasi 006.
- Balasan komentar disimpan di `anime_comments.parent_comment_id`; migrasi 009
  bersifat add-only. Balasan sengaja dibatasi satu tingkat, sesuai proyeksi UI
  sumber yang mengelompokkan reply menurut parent.
- Subscribed Nanime tetap lokal-first untuk dukungan offline. Error query dan
  mutasi Supabase tidak dianggap sebagai daftar kosong atau sukses: layar
  Subscribed menampilkan status gagal sinkronisasi dan menyediakan retry.
  Feed notifikasi sekarang hanya menampilkan update katalog untuk anime yang
  sedang di-subscribe; jumlah badge beranda mengikuti filter yang sama.
  Identitas notifikasi memakai anime + label episode supaya rilis episode baru
  pada anime yang sudah lama di-subscribe tetap menghasilkan notifikasi baru.
  Status baca/hapus tersimpan lokal lintas sesi pada perangkat. Notifikasi push latar
  belakang belum tersedia karena provider katalog Nanime belum memberikan
  webhook/endpoint push dan tidak ada backend scheduler yang terhubung.
- Chat clan Nanime hanya tersedia bagi anggota aktif, menggunakan tabel pesan
  privat migrasi 010 serta polling 5 detik (tanpa ketergantungan pada publikasi
  Realtime Supabase). Pesan mendukung teks biasa sampai 2000 karakter.
- Gacha warna clan memakai katalog, harga, peluang dan pity Nanime di migrasi
  011; kontrak AniBiPlay membuktikan bentuk data dan perilakunya, tetapi nilai
  live berasal dari API yang tidak ada dalam APK lokal. Pengeluaran treasury,
  pity, duplikat/essence, kepemilikan dan equip semuanya dihitung di RPC server.
- Afinitas Nanime pada `/affinity` mencakup proposal, penerimaan/penolakan,
  pembatalan, pemutusan dengan cooldown, privasi profil, misi harian, XP/level,
  dan leaderboard. Slot per tier (1/4/4/5) disalin dari enum hasil dekompilasi;
  harga XP, reward misi dan threshold level pada migrasi 012 adalah konfigurasi
  baru Nanime karena nilai runtime AniBiPlay tidak ditemukan secara lokal.
  Klaim misi divalidasi oleh riwayat tonton, pesan langsung, dan sesi penggunaan
  tersimpan di Supabase, bukan oleh klaim klien. Migrasi 012 belum diterapkan.

## 6. Fitur lama yang dipensiunkan

Modul transisi UI Nanime yang sebelumnya hanya berupa stub kosong telah dihapus
setelah dipastikan tidak direferensikan. Penghapusan ini tidak menyentuh state,
provider anime, layanan, ataupun penyimpanan yang masih aktif:

- `src/app.ts`, `src/main.ts` (diganti `src/main.tsx` + `src/App.tsx`)
- `src/views/*.ts`, `src/ui/{components,nav,sheet,toast}.ts`,
  `src/core/{router,store,api,config,icons,movies}.ts`
- `src/sync/*`, `src/features/*`, `src/metadata/*` (metadata AniList/Kitsu,
  ekspor/impor, PWA, notifikasi, shortcut tidak ada di spesifikasi v2)
- `src/__shot__/*` (mock screenshot lokal) dan stylesheet kosong
  (`card/detail/features/hero/index/layout/panels/responsive/wibuku.css`).
- `src/shell/Topbar.tsx`, komponen lama yang tidak lagi diimpor oleh rute.

Fitur ekspor/impor data dan PWA dihapus karena tidak diminta pada spesifikasi
v2; penyimpanan data pengguna sepenuhnya ditangani Supabase + state lokal.

## 7. Lingkungan

- Node `>=22.22.2` (lihat `package.json`).
- Tes: Vitest dengan environment `node` (default) dan `jsdom` khusus smoke test;
  `tests/setup.ts` menyediakan polyfill minimal (localStorage, observer, matchMedia).
- Build APK CI membutuhkan `ANDROID_GOOGLE_SERVICES_JSON` (base64) untuk
  Firebase; tanpa secret tersebut build tetap jalan tanpa Firebase.
- Font UI menggunakan Roboto yang diekstrak dari resource APK AniBiPlay agar
  bentuk teks web mengikuti font Android sumber tanpa ketergantungan CDN.

## 8. Role developer dan akses gratis (checkpoint 2026-10-18)

- Migration 013 menambah `profiles.developer_level`, profile broadcast
  `nanime_developer_messages`, serta RLS. Akun `kusumanata767@gmail.com`
  dipromosikan oleh trigger hanya bila email Auth sudah terkonfirmasi.
- Supabase Auth menggunakan UUID; angka `#1` hanya display tag. Tidak ada
  perubahan OAuth, redirect URL, atau callback `nanime://auth-callback`.
- Composer hanya ditampilkan untuk email developer; RLS memeriksa lagi
  `auth.users.email` saat insert. Pesan developer terlihat bagi pengguna Nanime
  yang login.
- Nanime tidak memiliki kode payment/premium gate. CTA beranda sekarang
  menyatakan seluruh fitur Nanime gratis. Kualitas stream yang nyata tetap
  mengikuti kemampuan provider eksternal dan tidak dapat dipaksa oleh klien.
- Migrations 006–013 belum diterapkan ke Supabase produksi dari workspace ini;
  jalankan setelah migration dasar 001–005 tersedia. Tidak ada perubahan DB
  jarak jauh dilakukan.
