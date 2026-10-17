# VERIFICATION — Nanime v2 (Reinkarnasi)

Dokumen ini menjelaskan cara memverifikasi bahwa reinkarnasi (React 19 + Vite +
Supabase + Capacitor) berjalan sesuai spesifikasi. Jalankan semua perintah dari
root repo.

## 1. Verifikasi otomatis (wajib hijau)

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 14 file, 126 test
npm run build       # tsc --noEmit && vite build
```

Status terakhir (snapshot pengembangan):

- `npm run typecheck` — 0 error.
- `npm test` — 14 file / 126 test lulus.
- `npm run build` — 0 error; 175 modul; output:
  - `index-*.js` ±177 kB (gzip ±51 kB)
  - `vendor-react` ±266 kB, `vendor-supabase` ±218 kB, `vendor` ±18 kB
  - `hls-*.js` ±593 kB — **lazy** (dynamic import saat pemutar dibuka)
  - `index-*.css` ±45 kB

## 2. Yang diuji otomatis

| Area | File uji |
| --- | --- |
| Jadwal, TTL cache, urutan kualitas | `tests/api.test.ts` |
| Tautan rute, kode OAuth, share/kopi | `tests/router.test.ts` |
| Store Zustand (app/settings/library/player) | `tests/store.test.ts` |
| TitleIndex kanonik ↔ sumber | `tests/sync.test.ts` |
| CacheManager (memori, inflight, stale) | `tests/exportImport.test.ts` |
| QualityNormalizer — 4 kualitas selalu ada | `tests/match.test.ts` |
| Skor 0–1000 & merge kartu kanonik | `tests/movies.test.ts` |
| Engine data (pencarian, episode, fallback, registry) | `tests/engines.test.ts` |
| Normalisasi kartu provider | `tests/normalize.test.ts` |
| Scraper/transport/provider fixture | `tests/scraper.test.ts`, `tests/transport.test.ts`, `tests/providers-fixture.test.ts`, `tests/utils.test.ts`, `tests/movies.test.ts` |
| Smoke aplikasi React (gerbang login, nav, galat umum, pemutar global) | `tests/dom-smoke.test.ts` |

## 3. Invarian produk — diverifikasi otomatis

- **Tanpa nama sumber di UI** — `tests/dom-smoke.test.ts` memastikan DOM tidak
  pernah memuat nama provider.
- **Satu-satunya pesan galat** — `"Gagal memuat data, silakan periksa koneksi
  internet dan coba lagi nanti."` diuji di smoke test.
- **Wajib login Google** — smoke test memastikan onboarding tampil sebelum ada
  sesi dan navigasi bawah muncul setelah masuk.
- **4 kualitas selalu ada** — `tests/match.test.ts` (slot kosong memakai
  kualitas terdekat, `approx`).
- **Anoboy paling akhir** — `tests/engines.test.ts` (urutan registry).
- **Skor 0–1000 & merge kanonik** — `tests/movies.test.ts`, `tests/engines.test.ts`.
- **Video tidak pernah hilang** — `tests/dom-smoke.test.ts`: sesi pemutar yang
  dibuka di halaman biasa tampil sebagai floating (`.gp-floating`, lebar default
  240px), tetap hidup saat masuk `/watch` (berubah `.gp-docked`), kembali
  floating di halaman lain, dan hanya hilang setelah `close()` eksplisit.
  Geometri floating dijaga 160–400px (`clampFloatWidth`) di `tests/store.test.ts`.
- **"Developer: Nata" di layar masuk** — diuji di `tests/dom-smoke.test.ts`.

## 4. Verifikasi manual (perangkat/emulator)

1. `npm run dev` → buka web.
2. Login Google: harus diarahkan keluar, kembali ke `#/auth/callback`, lalu masuk
   ke Beranda. (Konfigurasi dashboard: lihat `ASSUMPTIONS.md`.)
3. Rute: `/home`, `/search`, `/schedule`, `/favorites`, `/history`, `/profile`,
   `/settings`, `/detail/:id`, `/watch/:id/:episode`, rute tak dikenal → Beranda.
4. Pemutar global: pilih kualitas 1080p/720p/480p/360p (selalu tersedia); ganti
   server; kontrol sembunyi otomatis setelah 3 detik (tap untuk memunculkan);
   double-tap kiri/kanan ±10 detik; slider kecerahan (kiri) & volume (kanan);
   bilah geser merah; progres tersimpan (buka ulang episode → lanjut).
5. Keluar dari `/watch` ke halaman mana pun → video menjadi Floating Mini
   Player (240×135, kanan bawah): drag bebas, pinch 160–400px, tap putar/jeda,
   double-tap kembali ke pemutar penuh, long-press lalu tarik ke zona merah
   bawah untuk menutup. Audio tidak pernah terputus saat pindah halaman.
6. Luring: matikan jaringan → beranda menampilkan pesan galat umum (bukan nama
   provider) + tombol "Coba lagi"; data cache lama tetap tampil bila ada.
7. Favorit/riwayat: tambah, hapus, dan bersihkan; cek sinkron ke Supabase
   (tabel `favorites`, `history`) saat login.

## 5. Verifikasi Android (APK)

Build lokal (butuh Android SDK):

```bash
npm run android:apk
```

CI GitHub Actions:

- `.github/workflows/ci.yml` — lint (tsc) → test → build → assembleDebug.
- `.github/workflows/android.yml` — build APK + artifact.
- `.github/workflows/deploy-pages.yml` — deploy web statis ke GitHub Pages.

Deep link login APK: `nanime://auth-callback` (dipasang oleh
`scripts/setup-android-deeplink.sh`).

## 6. Kriteria selesai

- [x] `tsc` 0 error, seluruh tes lulus, `vite build` 0 error.
- [x] Seluruh UI lama dipensiunkan (file fisik tetap ada, isi di-stub).
- [x] Fitur sesuai spesifikasi: beranda, pencarian, jadwal, detail, pemutar,
      favorit, riwayat, profil, pengaturan, onboarding + login Google.
- [x] Pemutar global V3: satu elemen video persisten di luar `<Routes>`,
      docked di `/watch`, Floating Mini Player yang bisa di-drag/pinch di
      halaman lain tanpa menghentikan playback.
- [x] Sinkronisasi Supabase (profil, favorit, riwayat+progres, pengaturan).
- [x] APK & web build tetap didukung pipeline yang ada.
