# Integrasi Supabase Nanime

Dokumentasi konfigurasi, migrasi database, RLS, autentikasi, dan cara menguji
sinkronisasi. Bacalah bagian **Tindakan Manual** di akhir — beberapa langkah hanya
bisa dilakukan dari dashboard Supabase.

## Ringkasan arsitektur

```
UI (views) ──► Store (sinkron, localStorage)   ←── sumber utama offline
                    │ Store.onChange (emitter)
                    ▼
              SyncEngine (async) ──► Supabase (mirror per akun)
                    │
              OfflineQueue (localStorage)  → bertahan setelah app ditutup
```

- **Lokal-prioritas**: UI tetap membaca `Store` secara sinkron. Perubahan
  diamati lewat `Store.onChange`, ditandai kotor, lalu didorong `SyncEngine`.
- **Kegagalan remote tidak pernah menghapus data lokal.**
- **Konflik**: *last-write-wins* per baris berdasarkan `updated_at` (milidetik).
- **Tamu**: selalu bisa dipakai tanpa login; data digabung (bukan dihapus)
  setelah masuk akun.

## File yang dibuat/diubah

| File | Peran |
|------|-------|
| `src/sync/client.ts` | Init client tunggal + validasi konfigurasi |
| `src/sync/auth.ts` | Abstraksi Supabase Auth (Google OAuth, email OTP, sesi) |
| `src/sync/repository.ts` | Konversi Store ↔ baris DB + merge LWW |
| `src/sync/queue.ts` | Antrean offline + tombstone (localStorage) |
| `src/sync/engine.ts` | SyncEngine: push/pull inkremental, debounce, backoff |
| `src/sync/migrate.ts` | Migrasi tamu→akun, hapus data akun |
| `src/sync/types.ts` | Tipe baris tabel & status sinkron |
| `src/sync/index.ts` | Barrel publik |
| `src/core/store.ts` | + emitter `onChange` (tanpa mengubah ~100 call site) |
| `src/views/profile.ts` | UI akun & sinkronisasi |
| `src/main.ts` | Init sync + tangani redirect OAuth (web & native) |
| `supabase/migrations/001_init.sql` | Skema DB + RLS |
| `.env.example` | Template konfigurasi |
| `scripts/setup-android-deeplink.sh` | Suntik intent-filter `nanime://` |

## Konfigurasi environment

Salin `.env.example` → `.env` lalu isi:

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env` sudah masuk `.gitignore`. Publishable key **bukan secret** — perlindungan
database sepenuhnya bergantung pada RLS. **Jangan pernah** menaruh
`service_role` key, database password, atau kredensial admin di source/APK/repo.

## Skema database

Lima tabel privat, PK komposit `(user_id, key/id)`, timestamp `bigint` (epoch ms)
agar cocok dengan `Date.now()` tanpa konversi:

- `entries` — favorit + meta personal (`key = provider:id`, `status`, `rating`, `favorite`)
- `progress` — lanjutkan menonton (`episode`, `percent`, `completed`, `updated_at`)
- `history` — riwayat tonton (`episode`, `watched_at`)
- `lists` — daftar khusus (`id`, `name`)
- `settings` — key-value (`cfg`/`shist`/`seen`) sebagai `jsonb`

## Row Level Security

Semua tabel `enable row level security`. Empat kebijakan per tabel
(select/insert/update/delete) dengan pola:

- `USING (auth.uid() = user_id)` untuk select & delete
- `WITH CHECK (auth.uid() = user_id)` untuk insert & update

Tidak ada `USING (true)` / `WITH CHECK (true)` pada tabel privat. Klien anonim
tanpa sesi valid tidak dapat membaca/mengubah data apa pun.

## Menerapkan migrasi (MANUAL)

Migrasi **belum** diterapkan sampai kamu menjalankannya sendiri:

1. Buka **Supabase Dashboard** → project `zueplyqfvjtnpvhaivkx` → **SQL Editor**.
2. **New query** → tempel isi `supabase/migrations/001_init.sql`.
3. **Run**. Ulang aman (idempoten — semua `IF NOT EXISTS` / `DROP POLICY IF EXISTS`).

## Mengaktifkan masuk Google (MANUAL)

1. **Google Cloud Console** → pilih/buat project → **APIs & Credentials** →
   **OAuth consent screen** (isi app name, scope: `email`, `profile`).
2. Buat kredensial **OAuth client ID** tipe **Web application**:
   - Authorized redirect URI: `https://<project-id>.supabase.co/auth/v1/callback`
3. Salau **Client ID** & **Client Secret**.
4. **Supabase Dashboard** → **Authentication** → **Providers** → **Google** →
   aktifkan → tempel Client ID & Secret → **Save**.

> Tanpa langkah ini, tombol "Masuk dengan Google" akan memunculkan pesan jelas
> bahwa provider belum diaktifkan (bukan crash).

## Build Android (deep-link OAuth)

`capacitor.config.ts` menyetel `server.androidScheme: 'nanime'`. Skrip
`scripts/setup-android-deeplink.sh` menyuntik intent-filter berikut ke
`AndroidManifest.xml` (dijalankan CI setelah `cap add android`):

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="nanime" />
</intent-filter>
```

Alur native: `signInWithOAuth({ skipHttpRedirect:true, redirectTo:'nanime://auth-callback' })`
→ buka URL di browser → kembali ke app via deep link → `exchangeCodeForSession`.

> **Catatan**: alur OAuth native paling andal bila SHA-1 fingerprint keystore
> (debug + rilis) didaftarkan di Google Cloud Console untuk OAuth client Android.
> Tanpa itu, gunakan alur web (halaman yang di-host) atau email OTP.

## Menguji sinkronisasi dua sesi pengguna

1. Jalankan migrasi + aktifkan Google (di atas).
2. Buka app di **Perangkat A**, masuk **Akun 1**, tambah beberapa favorit.
   Tunggu ~2 detik (debounce) atau ketuk **Sinkronkan sekarang** di Profil.
3. Buka app di **Perangkat B** (atau jendela/incognito lain), masuk **Akun 2**
   → harus **tidak** melihat data Akun 1 (terisolasi RLS).
4. Masuk **Akun 1** di Perangkat B → data favorit Akun 1 muncul.
5. Ubah status anime di A → Sinkronkan → buka di B → perubahan terlihat
   (LWW: yang terakhir menang).

## Status sinkronisasi (jujur)

UI Profil menampilkan status nyata dari `SyncStatus`:
`idle` / `syncing` / `error` / `offline`, jumlah antrean belum terkirim, dan waktu
sinkron terakhir. UI **tidak** pernah mengklaim "tersinkron" bila operasi server
gagal.

## Keterbatasan yang disengaja

- **Tombstone** untuk delete: penghapusan lokal dicatat lalu diterapkan ke remote
  saat push berikutnya (menangani kasus baris dihapus di satu perangkat).
- **Tanpa realtime subscription**: sinkronisasi berbasis pull/push inkremental +
  debounce, bukan listener realtime (cukup untuk data personal berukuran kecil).
- **Settings disinkron per-key** (`cfg`/`shist`/`seen`) dengan LWW per key.
