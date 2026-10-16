# Kebijakan Privasi (Draf) — Nanime

> Draf ini mencerminkan perilaku aplikasi yang benar-benar diimplementasikan.
> Selalu tinjau dengan penasihat hukum sebelum publikasi di toko aplikasi.

## Data yang disimpan

### Di perangkat (lokal, selalu ada — termasuk mode tamu)

Nanime menyimpan berikut di penyimpanan lokal perangkat (localStorage) untuk
fungsi inti aplikasi:

- Favorit anime
- Riwayat tonton & progres lanjut-menonton
- Daftar khusus (bila dibuat)
- Riwayat pencarian
- Penanda episode baru
- Pengaturan (provider, tema, notifikasi, preferensi pemutaran)

Data lokal ini tidak dikirim ke server mana pun kecuali kamu **masuk akun** dan
menjalankan sinkronisasi.

### Disinkronkan ke server (hanya setelah masuk akun)

Jika kamu masuk akun dan mengaktifkan sinkronisasi, data berikut dikirim ke
server Supabase kami dan terikat ke akunmu:

- Favorit & status/rating anime
- Progres lanjut-menonton
- Riwayat tonton
- Daftar khusus
- Pengaturan aplikasi (tema, preferensi, dll.)

Data ini **hanya** dapat dibaca/diubah oleh akunmu sendiri (dikunci oleh Row
Level Security di sisi server).

## Autentikasi

- **Google**: kami menggunakan Supabase Auth dengan OAuth Google. Kami menerima
  identitas dasar (ID akun, nama, email, foto profil) sesuai izin yang kamu
  berikan saat masuk. Kami **tidak** menyimpan kata sandi Google.
- **Email**: opsi tautan masuk (magic link) tanpa kata sandi.

## Data yang TIDAK kami kumpulkan

- Lokasi
- Kontak
- Kamera / mikrofon
- File di perangkat (di luar berkas cadangan yang kamu pilih untuk impor/ekspor sendiri)
- Identitas perangkat untuk pelacakan iklan

## Pembagian data

Kami **tidak menjual** data pribadi. Data sinkronisasi hanya diproses oleh
layanan infrastruktur Supabase yang menjalankan aplikasi kami, dan tunduk pada
pembatasan akses per-pengguna (RLS).

## Penghapusan data

- **Keluar akun**: sesi dihapus dari perangkat; data lokal tetap ada.
- **Hapus data akun** (di menu Profil): menghapus seluruh data sinkronisasi
  yang terikat akunmu dari server.
- **Reset semua data** (di menu Profil): menghapus seluruh data lokal.
- Menghapus aplikasi dari perangkat menghapus data lokal (kecuali cadangan yang
  sudah kamu ekspor).

## Konten pihak ketiga

Nanime adalah klien yang mengambil informasi katalog dari situs anime pihak
ketiga secara langsung dari perangkat kamu. Kami tidak menyimpan, meng-host, atau
mendistribusikan video apa pun.

## Perubahan kebijakan

Versi terbaru akan tersedia di halaman resmi aplikasi. Perubahan material akan
diberitahukan di aplikasi.

## Kontak

Untuk pertanyaan privasi, hubungi melalui kanal resmi rilis aplikasi.
