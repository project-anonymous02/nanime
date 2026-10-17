# MAP ANIBIPLAY — Referensi UI/UX Persis

> **Sumber:** 47 screenshot asli dari repo `https://github.com/project-anonymous02/test`
> (file `Screenshot_2026 10 17-*.jpg`, resolusi perangkat 1080×2436, Android)
> **Tujuan dokumen:** mencatat SEMUA layar, letak elemen, ukuran, warna, teks, dan animasi
> **SAMA PERSIS** sebagai acuan rombak total UI Nanime.
>
> Semua ukuran/posisi di bawah ditulis untuk kanvas lebar **1080 px** (dibagi 3 = dp Android, karena density 3×).

---

## 0. INDEKS SCREENSHOT (urut waktu)

| # | File | Isi |
|---|------|-----|
| 1 | Screenshot_20261017-110703 | Home atas: header profil + premium + TOP LEADERBOARD + Public Diskusi + Terakhir Ditonton + New Anime Update |
| 2 | …-110712 | Home scroll: search bar sticky + kartu New Anime Update (grid 3 kolom) |
| 3 | …-110719 | Halaman Genre Series (chip semua genre) + Weekly Anime |
| 4 | …-110722 | Weekly Anime (kartu besar rank #1–#4) + Completed Anime |
| 5 | …-110731 | Donghua Update + Movie Update |
| 6 | …-110931 | Hasil pencarian "Kimetsu no yaiba" (grid 3 kolom, hitungan views) |
| 7 | …-110940 | Halaman pencarian kosong (bar + placeholder) |
| 8 | …-110947 | Jadwal Tayang: hari Sabtu, timeline, kartu episode |
| 9 | …-110952 | Jadwal Tayang: hari Minggu |
| 10 | …-111002 | Jadwal Tayang: Kamis→Jumat (header hari menerus saat scroll) |
| 11 | …-111009 | Jadwal Tayang: Rabu→Kamis |
| 12 | …-111011 | Jadwal Tayang: Selasa→Rabu |
| 13 | …-111015 | Jadwal Tayang: Senin→Selasa |
| 14 | …-111018 | Jadwal Tayang: Senin (21:22–23:20) |
| 15 | …-111022 | Subscribed Anime (Total 1, dropdown Terbaru) |
| 16 | …-111027 | Riwayat Menonton (mode SINGLE, grup per tanggal) |
| 17 | …-111033 | Riwayat Menonton (mode MULTI, grup per series + timeline) |
| 18 | …-111037 | SocialLine (kosong, FAB orang) |
| 19 | …-111053 | Pengaturan atas (profil + XP + Profil + Pemutaran) |
| 20 | …-111056 | Pengaturan bawah (Notifikasi, Sosial, Penyimpanan, Aplikasi, Logout) |
| 21 | …-111109 | Onboarding slide 1: WELCOME |
| 22 | …-111112 | Onboarding slide 2: Disclaimer / Ketentuan Layanan |
| 23 | …-111115 | Onboarding slide 3: SIAP MULAI (login Google) |
| 24 | …-111151 | Home varian hero carousel (#2 One Piece, 137.9K views) |
| 25 | …-111203 | Subscribed Anime + dropdown terbuka (Terbaru/A-Z/Rating) |
| 26 | …-111256 | Notifikasi (kartu aksen kiri biru, tombol "Baca semua") |
| 27 | …-111307 | Profil (banner, statistik, tab Komentar) |
| 28 | …-111311 | Profil + bottom sheet "Foto Profil" |
| 29 | …-111314 | Profil tab Favorit |
| 30 | …-111317 | Profil tab Histori (progress merah) |
| 31 | …-113452 | Detail anime: hero besar, chip, Tonton Sekarang/Subscribe, Synopsis |
| 32 | …-113457 | Detail: synopsis diperluas + Related Anime + sticky title bar |
| 33 | …-113508 | Detail: Daftar Episode (mode list + input cari) |
| 34 | …-113510 | Detail: Daftar Episode (mode grid, chip "Eps 1" biru) |
| 35 | …-113516 | Player portrait + bottom sheet "Pilihan Kualitas Video" |
| 36 | …-113519 | Player portrait: info + Bantu Admin + chips aksi + Episode List + Comments |
| 37 | …-113522 | Player portrait: synopsis diperluas ("Tutup") |
| 38 | …-113527 | Player portrait: scroll (Episode List tampil) |
| 39 | …-113535 | Player portrait + bottom sheet "Pilihan Download Video" |
| 40 | …-125936 | Player LANDSCAPE: kontrol penuh, seek merah |
| 41 | …-125947 | Player LANDSCAPE: slider brightness (kiri) & volume (kanan), judul kiri-atas |
| 42 | …-125954 | Player LANDSCAPE + sheet "Pilihan Kualitas Video" |
| 43 | …-130027 | Home + mini player melayang (atas TOP GIVEAWAY USERS) |
| 44 | …-130032 | Home + mini player digeser ke tengah |
| 45 | …-130036 | Home + mini player digeser ke kanan-bawah |
| 46 | …-130058 | Launcher Android + mini player overlay (gear ↗, X, fit) |
| 47 | …-130238 | Player landscape mode terkunci (ikon gembok kiri-tengah) |

---

## 1. DESIGN TOKENS (diambil dari gambar)

### Warna
| Nama | Nilai perkiraan | Dipakai di |
|------|-----------------|------------|
| bg-app | `#0C0E16` (hitam kebiruan pekat) | latar semua halaman |
| bg-app-top-grad | `#2A1520` → transparan | gradasi maroon di belakang header Home |
| card | `#151A28` / `#161B2A` | kartu episode jadwal, kartu notifikasi, list |
| card-elev | `#1B2130` | kartu terangkat, dropdown, sheet |
| sheet | `#11151F` | bottom sheet |
| accent-blue | `#2E7DFF` | tombol "BELI PREMIUM", "Tonton Sekarang", toggle ON, FAB, segmen aktif |
| accent-blue-deep | `#1E6FFF` | garis aksen kiri kartu notifikasi |
| link-cyan | `#45C4FF` | "Selengkapnya >", "Lihat Jadwal >", link aksi |
| gold | `#F5C518` | rating ★, "TOP LEADERBOARD", waktu timeline, rank #1, angka koin |
| yellow-btn | `#F6C445` | kotak lonceng premium, teks "SIAP MULAI", chip Disclaimer |
| orange | `#F59E0B` | "720p (Bagus)" |
| green | `#22C55E` | "480p (Standar)" |
| red | `#EF4444` | progress bar riwayat, seek bar, logout, badge notif |
| pink | `#F472B6` | ikon "TOP AFINITAS" |
| text | `#FFFFFF` | judul |
| text-sub | `#9AA3B2` | deskripsi, tanggal |
| text-dim | `#6B7280` | label "Menunggu Update", placeholder |
| divider | `#23293A` | garis pemisah |
| badge-dark | `rgba(10,14,22,.65)` | pill rating, pill views, rank jadwal |

### Bentuk & ukuran
- Radius: kartu besar **20–24**, kartu kecil/list **16**, thumbnail **12–14**, chip/pill **999 (full)**, input **999**, sheet atas **28**.
- Tinggi bar bawah (bottom nav): **±176 px** (≈59dp) + margin bawah 24.
- Padding horizontal konten: **40 px** (≈13dp).
- Heading section: **44 px** (≈15dp) bold `#FFFFFF`, jarak ke kartu 24 px.
- Judul halaman centered: **52–56 px** bold.
- Body: **36 px** (≈12dp) `text-sub`; judul kartu **38 px** bold.
- Ikon header: 44–48 px, putih.

### Tipografi
- Body/UI: sans-serif standar Android (Roboto) — di web pakai **Inter**.
- Display onboarding ("WELCOME", "SIAP MULAI"): font rounded chunky tebal (custom), warna putih/gold, ±110 px.

### Gerak/animasi (terlihat & konvensi)
- Perpindahan halaman: slide halus + fade.
- Carousel home: swipe horizontal + dots (dot aktif memanjang biru-cyan).
- Bottom nav: lingkaran highlight aktif membesar (spring), label muncul hanya di tab aktif.
- Jadwal: header hari "menerus" saat scroll; pil "←/→ hari" melayang.
- Poster: shimmer skeleton → fade-in saat gambar termuat.
- Bottom sheet: slide-up dengan drag handle; backdrop gelap.
- Progress riwayat: bar merah beranimasi isi.
- Marquee "Public Diskusi": teks berjalan lambat.
- Mini player: muncul dengan scale/fade dari pemutar, bisa digeser bebas (drag) dan mengambang di semua halaman.

---

## 2. BOTTOM NAVIGATION (semua halaman utama)

Bar mengambang (floating pill), lebar ± 92% layar, tinggi ± 120 px, radius full, bg `#171B29` transparan-90 + shadow, posisi **20 px dari bawah**.

5 item, urutan & ikon:
1. **Home** — ikon rumah
2. **Jadwal** — ikon kalender
3. **Subscribed** — ikon kotak video/play
4. **Riwayat** — ikon jam dengan panah putar
5. **SocialLine** — ikon grafik garis

Perilaku:
- Tab aktif: lingkaran highlight **±160 px** (`#5B5A78` transparan) di belakang ikon + **label putih bold ±13px** di bawah ikon.
- Tab tidak aktif: hanya ikon putih, tanpa label.
- Semua halaman utama (Home, Jadwal, Subscribed, Riwayat, SocialLine, Profil) memakai bar ini. Pengaturan, Notifikasi, Detail, Player TIDAK memakai bar (full-screen).

---

## 3. ONBOARDING (3 slide, geser ke atas)

**Slide 1 — WELCOME** (Screenshot_…-111109)
- Paling atas, center: teks kecil abu `v1.4.9 • build 47` (di Nanime ganti versi Nanime).
- Tengah: **"WELCOME"** putih, font display rounded ±150 px, rata kiri-tengah (margin kiri 100 px).
- Bawah teks: 2 baris abu center: `Platform anime, donghua & movie` / `untuk komunitas Indonesia.`
- Tepi kanan (vertikal, tengah layar): 3 indikator — slide aktif = **bar kuning vertikal** ±48 px, lainnya titik abu 12 px.
- Bawah center: ikon chevron-atas abu + teks `Geser ke atas`.

**Slide 2 — Disclaimer** (Screenshot_…-111112)
- Chip kecil `Disclaimer`: bg coklat-gelap keemasan, teks gold, radius full, padding 24×12, di kiri atas (margin top ±380 px).
- Judul besar putih **"Ketentuan Layanan"** ±90 px bold.
- 3 poin, tiap poin: bullet titik gold + judul putih bold ±40 px + paragraf abu ±34 px:
  1. **Aplikasi tidak resmi** — "AnibiPlay adalah aplikasi pihak ketiga. Semua merek dagang dan hak cipta menjadi milik pemiliknya masing-masing."
  2. **Tidak mengunggah konten** — "Aplikasi ini tidak mengunggah, menyimpan, atau mendistribusikan konten media. Semua konten bersumber dari tautan yang tersedia secara publik di internet."
  3. **Pelanggaran hak cipta** — "Jika kamu adalah pemilik hak cipta dan merasa kontenmu digunakan secara tidak tepat, hubungi anibiplay@gmail.com."
- Indikator kanan: titik ke-2 aktif (bar kuning).
- Bawah: chevron-atas + `Geser ke atas`.

**Slide 3 — SIAP MULAI / Login** (Screenshot_…-111115)
- Judul **"SIAP MULAI"** warna gold, font display rounded ±120 px, center; badge kecil `FREE` outline gold di kanan atas teks.
- Sub abu center 2 baris: `Masuk untuk sinkronisasi riwayat` / `dan preferensi tontonan kamu.`
- Indikator kanan: titik ke-3 aktif.
- Bawah:
  - Tombol putih full-radius tinggi ±130 px: logo **G Google berwarna** + teks hitam bold `Lanjut dengan Google`.
  - Pemisah: garis — `atau` abu — garis.
  - Tombol teks: ikon login + `Masuk sebagai Tester` (abu terang).
  - Footer abu kecil 3 baris: legal + `v1.4.9`.
- Background polos `bg-app`.

---

## 4. HOME

Urutan seksi dari atas ke bawah (SAMA PERSIS):

### 4.1 Header profil (kartu gradasi maroon)
- Kartu radius 24, gradasi maroon (`#2A1520`) memudar ke bg, padding 28.
- Baris 1: avatar bulat ±100 px (foto), sebelahnya nama **bold putih ±52 px** + `#774058` abu ±36 px; chip `🛡 Lvl. 214` (pill abu-biru, ikon perisai) di bawah nama.
- Kanan: ikon **lonceng putih** dengan badge merah bulat angka `5` (di atas kanan lonceng), lalu ikon **kaca pembesar putih**.
- Garis divider tipis.
- Baris 2: kiri `✦ 0 Crystal` (ikon kilau putih + angka putih bold); kanan pill gelap dengan teks gold `✨ AniGames`.

### 4.2 Banner premium
- Kartu radius 24 bg maroon redup, tinggi ±150 px, padding 28.
- Kotak kuning 96×96 radius 20 dengan ikon **lonceng hitam**.
- Sebelahnya tombol pill biru penuh (`#2E7DFF`) teks putih bold ±38 px: **`BELI PREMIUM DI SINI`** (lebar mengisi sisa).

### 4.3 Carousel besar (swipe 3 halaman, dots di bawah)
Kartu radius 24, tinggi ±470 px, bg maroon gelap. **3 halaman**, dots di bawah kartu (dot aktif biru-cyan memanjang ±46 px, lain abu 12 px):

- **Halaman 1 — TOP LEADERBOARD**: header `👑 TOP LEADERBOARD` gold bold; 2 kolom:
  - Kiri: `⚡ TOP XP` (ikon petir biru) + chevron `>`;
  - Kanan: `★ TOP AFINITAS` (bintang pink) + chevron `>`;
  - Tiap kolom 4 baris: lingkaran rank (1 gold, 2 abu, 3 gold, 4 gold) + avatar + nama putih + nilai gold kanan (`925.6K`, `894.2K`, `875.6K`, `873.7K`) / kolom kanan `Lv30`.
- **Halaman 2 — Hero featured**: gambar penuh kartu; pill kiri-atas `👁 137.9K views` (ikon mata + teks putih, bg gelap transparan); tengah-bawah `#2` raksasa gold ±120 px + judul `One Piece` putih bold center.
- **Halaman 3 — TOP GIVEAWAY USERS**: judul gold `👑 TOP GIVEAWAY USERS`; podium 3 avatar (tengah lebih besar, mahkota gold + cincin laurel gold, lingkaran rank ① gold / ② abu / ③ biru); daftar baris `#1 Roxy [badge guild OCTA] 202212d` … `#5 B… 83001d` (pill gelap transparan, rank gold, badge guild, angka hari gold kanan).

### 4.4 Search bar sticky
- Saat halaman di-scroll melewati header: muncul **search pill** menempel di atas (di bawah status bar).
- Pill full-radius tinggi ±110 px bg `#1E2432`, ikon kaca pembesar abu kiri, placeholder `Mencari anime` abu.

### 4.5 Public Diskusi
- Kartu radius 20 tinggi ±100 px: ikon gelembung chat biru + `Public Diskusi` putih bold; garis vertikal pemisah; teks marquee abu (`hiatus : lah 😭`); panah gold `→` kanan.

### 4.6 Terakhir Ditonton
- Header: `Terakhir Ditonton` (heading putih) + kanan link cyan `Selengkapnya >`.
- Scroll horizontal, kartu ±440 px lebar: gambar 16:9 radius 18 dengan overlay kiri-bawah `Eps 1` putih bold; bawah gambar: judul putih bold 1–2 baris, baris ikon jam cyan + `12:02 / 23:50` (putih/abu).

### 4.7 New Anime Update
- Header: `New Anime Update` + kanan link cyan `Lihat Jadwal >`.
- **Grid 3 kolom**, poster portrait radius 16:
  - Kiri-atas: badge `New` biru (`#2E7DFF`) teks putih, hanya sudut kiri-atas membulat;
  - Kanan-atas: pill gelap `★ 8.1` (bintang gold + angka putih);
  - Kiri-bawah overlay: `Eps 1` putih bold;
  - Di bawah poster: `▷ 150` (segitiga play outline + angka abu), lalu judul putih bold 2 baris, dan info `TV` dsb.

### 4.8 Genre Series
- Heading `Genre Series`.
- Chip wrap (pill outline border abu gelap, teks putih): Action, Adult Cast, Adventure, Avant Garde, Award Winning, Comedy, Demons, Drama, Ecchi, Fantasy, Game, Girls Love, Gore, Gourmet, Harem, Historical, Horror, Isekai, Josei, Magic, Martial Arts, Mecha, Military, Music, Mystery, Mythology, Parody, Psychological, Reincarnation, Romance, Samurai, School, Sci-Fi, Seinen, Shoujo, Shoujo Ai, Shounen, Slice Of Life, Space, Sports, Super Power, Supernatural, Suspense, Thriller, Time Travel, Tokusatsu, Vampire, Movie.

### 4.9 Weekly Anime
- Header + kanan `Selengkapnya >` cyan.
- **Grid 2 kolom**, kartu besar radius 20:
  - Badge kiri-atas: pill gold `#1` (kotak radius kiri-atas saja, teks gelap);
  - Kanan-atas: pill gelap `★ 8.1`;
  - Dalam gambar: teks putih besar `170 Eps` kiri-bawah;
  - Bawah gambar: `▷ 219.9K views` abu, judul putih bold (Black Clover, Naruto: Shippuuden, One Piece, NARUTO).

### 4.10 Completed Anime
- Heading; grid 3 kolom poster dengan pill rating kanan-atas (Dead Poets Society, Forrest Gump, Despicable Me).

### 4.11 Donghua Update
- Heading; grid 2 kolom kartu besar (seperti Weekly): badge `New` biru + rating gold + `Eps 169` putih dalam gambar, bawah: views + judul (Soul Land 2, Against The Sky Supreme).

### 4.12 Movie Update
- Header + kanan `Lihat Genres >` cyan; grid 3 kolom poster:
  - Badge `Movie` biru kiri-atas + rating kanan-atas + `11 Eps`/`1 Eps` kiri-bawah; bawah: views + judul.

---

## 5. PENCARIAN / HASIL

### 5.1 Halaman pencarian kosong (…-110940)
- Top bar: panah kembali `←` putih (kiri, ±44 px) + search pill memanjang (ikon kaca + placeholder `Mencari anime` + kursor).
- Isi: kosong gelap (hasil muncul saat mengetik).

### 5.2 Hasil pencarian (…-110931)
- Top bar sama, pill memuat query (`Kimetsu no yaiba`).
- **Grid 3 kolom** poster identik New Anime Update: `Eps N` overlay, bawah: `▷ 30.1K`, judul 2 baris (judul lengkap: "Kimetsu no Yaiba Movie …", "Kimetsu no Yaiba", "Kimetsu no Yaiba Season 2", dsb).
- Poster yang belum termuat = kotak gelap polos (skeleton).

---

## 6. JADWAL TAYANG

- Judul halaman centered **"Jadwal Tayang"** putih bold ±56 px; di bawahnya **garis divider** penuh.
- Baris hari:
  - Hari AKTIF: chip radius full (bg biru-gelap `#2B3550`) teks putih bold, kiri.
  - Kanan: pill lebih gelap `9 Anime` (teks abu).
- **Timeline kiri**: kolom ±120 px; label waktu gold bold (`23:15`) di atas titik gold; garis vertikal olive-gold tipis turun antar item.
- **Kartu episode** (radius 20, bg `#151A28`, margin kiri mengikuti timeline):
  - Thumbnail ±300 px persegi radius 14 dengan **garis aksen gold tipis di tepi kiri kartu**;
  - Judul putih bold ±40 px 2 baris (mis. "Yasei no Last Boss ga Arawareta! Seas…");
  - `Episode 3` putih reguler;
  - `Menunggu Update` abu;
  - Baris: `▷ 27.7K • ★ 7.0` (play outline + views + titik + bintang gold + skor).
- **Scroll menerus antar hari**: hari-hari lain muncul sebagai **header penuh** (row radius 20 bg `#141926`, nama hari putih bold + pill `N Anime` kanan). Hari aktif "menempel" jadi chip di atas.
- **Pil navigasi hari melayang** di atas bottom nav: kiri `← Jumat`, kanan `Minggu →` (pill gelap `#141926`, teks putih bold, ikon panah).
- Bottom nav tab **Jadwal** aktif.

---

## 7. SUBSCRIBED ANIME

- Judul centered **"Subscribed Anime"**.
- Baris: kiri `Total (1)` putih bold besar; kanan dropdown pill `Terbaru ⌄` (bg gelap).
  - Dropdown terbuka (…-111203): panel gelap radius 16 di bawah tombol berisi `Terbaru`, `A-Z`, `Rating`.
- **Grid 3 kolom** kartu: poster (pill rating `★ 8.3` kanan-atas), di bawah: `19 Eps` putih bold, `▷ 116.8K` abu, judul 2 baris (Re:Zero kara Hajimeru Isekai Seikats…).
- Bottom nav tab **Subscribed** aktif (ikon video dalam lingkaran highlight + label).

---

## 8. RIWAYAT MENONTON

- Judul centered **"Riwayat Menonton"** + sub abu center `Tahan series untuk pilih & hapus`.
- **Kontrol segmented melayang** kanan-bawah (di atas bottom nav): pill gelap berisi `SINGLE` | `MULTI`; segmen aktif biru penuh teks putih bold, non-aktif teks abu.

**Mode SINGLE** (…-111027):
- Grup tanggal: chip gelap radius full (`Kemarin`, `17 September 2026`) dengan garis vertikal pendek di bawah chip.
- Item: thumbnail poster kecil ±240 px (radius 12) kiri; kanan: judul putih bold 2 baris, `Episode 1 • Kemarin` abu; **progress bar merah** (isi merah `#EF4444`, sisa `#475069`, titik merah di ujung isi) + kanan `12:02 / 23:50` abu.

**Mode MULTI** (…-111033):
- Kartu series radius 20: thumbnail + judul + chip `1 episode` / `12 episode`.
- Di dalam kartu: baris episode dengan **timeline**: garis vertikal biru tipis + **titik biru**; tiap baris: `Episode N` putih bold + kanan tanggal abu; progress bar merah + `22:33 / 23:56`.
- Bottom nav tab **Riwayat** aktif.

---

## 9. NOTIFIKASI

- Top bar: `←` kiri + judul centered **"Notifikasi"**.
- Kartu notifikasi radius 16, bg `#151B2B`, **aksen batang biru tebal di tepi kiri** (indikasi belum dibaca):
  - Lingkaran ikon 96 px (ikon play / ikon orang),
  - Judul putih bold (`Komentar Kamu Dibalas`, `Pertemanan Dihapus`),
  - Badan abu 2 baris,
  - Waktu abu kecil (`8 hari lalu`),
  - Kanan atas: **titik biru** (belum dibaca) + ikon **tong sampah abu**.
- Bawah center: tombol pill biru **`✓ Baca semua notifikasi`**.

---

## 10. PROFIL

- Atas: `←` kiri.
- **Banner** tinggi ±400 px gradasi biru-gelap; avatar bulat ±240 px center (naik di atas banner), badge kamera biru kecil kanan-bawah avatar.
- Nama center: `Nathiel` bold putih ±56 px + `#774058` abu di sampingnya.
- Chip row center: `🛡 Lvl. 214` (pill abu-biru), `👥 2` (pill gelap).
- **Statistik 4 kolom**: angka bold putih (`2`, `55`, `205`, `4456`) + label abu (`bulan`, `komentar`, `riwayat`, `menit`).
- 2 tombol besar pill gelap: `🐾 Peliharaan` (ikon paw) dan `⭐ Afinitas` (ikon bintang pink, border ungu tipis).
- **Tab**: `Komentar` | `Favorit` | `Histori` — aktif = putih + garis bawah putih; non-aktif abu.
- Isi list (per item):
  - Baris atas: avatar kecil + nama bold + kanan `• 1 bulan lalu` abu.
  - Baris isi: thumbnail ±120 px + judul putih + sub abu (`Episode 21` / `Favorit`); untuk komentar: teks komentar putih + `0 Replies` biru; untuk histori: **tombol play bulat gelap** + progress bar merah.
- **Bottom sheet "Foto Profil"** (…-111311): sheet radius atas 28 bg `#141A28`, drag handle abu; ikon kamera dalam lingkaran; judul `Foto Profil` bold center; tombol `Ubah di Google` (pill abu-gelap) & `Sinkronisasi Foto` (pill biru) lebar penuh; teks `Tutup` abu center; backdrop gelap.

---

## 11. SOCIALLINE

- Header: avatar + `Nathiel #774058` + ikon gear kanan.
- Empty state center: **`Belum ada aktivitas pertemanan.`** putih + `Mulai follow teman untuk lihat update mereka` abu.
- **FAB** biru bulat 130 px kanan-bawah (ikon 2 orang putih).
- Bottom nav tab **SocialLine** aktif.

---

## 12. PENGATURAN

- Judul centered **"Pengaturan"** (tanpa back arrow, tanpa bottom nav).
- Kartu profil radius 20 (bg biru-gelap `#1A2130`): avatar + `Nathiel` bold + email abu.
- Kartu XP radius 20: chip `XP 266868`, `🛡 Lvl. 214`, `Leaderboard XP ›`; baris `Sisa 632 XP ke level berikutnya` + kanan `49%` cyan; **progress bar biru** dengan titik di ujung.
- Label seksi abu (`Profil`, `Pemutaran`, `Notifikasi`, `Sosial`, `Penyimpanan`, `Aplikasi`).
- Baris dalam kartu (title putih + sub abu; kanan toggle/chevron/nilai):
  - `Nama profil` — `Terkunci 🔒`;
  - `Banner URL` — `Terkunci 🔒`;
  - `Profil private` + sub `Terkunci untuk role ini.` — toggle OFF;
  - `Auto play episode berikutnya` + sub — toggle **ON biru**;
  - `Kontrol brightness & volume` + sub — toggle ON;
  - `Skip intro` + sub — toggle OFF;
  - `Durasi intro default` — `85 detik 🔒`;
  - `Topic anime-update` + sub `Terima push update anime terbaru` — toggle ON;
  - `Teman & Chat` + sub + `›`;
  - `Cache gambar & efek` — `44.7 MB ›`;
  - `Kualitas default` — `480p ›`;
  - `Versi aplikasi` — `AnibiPlay v1.4.9 (47)`;
  - `Developer` — `noreasone` → **di Nanime: `Nata`**.
- Tombol **Logout**: kartu radius 20, ikon + teks **merah**.

---

## 13. DETAIL ANIME

- **Hero backdrop** penuh lebar, tinggi ± 55% layar; gambar poster art; gradasi gelap ke bawah; `←` putih melayang kiri-atas.
- Di bawah hero:
  - Baris kecil putih: judul alternatif/series (`Demon Slayer: Kimetsu no Yaiba - The Movie: Infi…`);
  - **Judul besar putih bold ±64 px, 2 baris** (`Kimetsu no Yaiba Movie 1: Mugenjou-hen - Akaz…`);
  - Baris status: ikon kalender gold + `Selesai Tayang` gold;
  - Baris chip pill gelap transparan: `-`, `2025-07-18`, `movie`, `30.1K views`;
  - Baris chip kedua: `movie`, `Selesai Tayang`.
- **Tombol aksi**:
  - Pill biru `▶ Tonton Sekarang` (ikon play putih);
  - Pill gelap `🔔 Subscribe` (ikon lonceng putih).
- Chip lagi (`movie`, `Selesai Tayang`).
- **Synopsis**: heading `Synopsis` + kanan `Selengkapnya ⌄` cyan; teks abu 2 baris (terpotong); diperluas penuh + `Tutup ⌃`.
- **Related Anime**: heading + grid 3 kolom poster dengan judul di bawah.
- **Daftar Episode**:
  - Baris kontrol: input radius full `Cari episode…` + tombol kotak radius 14 dengan chevron `⌄` + tombol kotak radius 14 dengan ikon grid.
  - Mode **list**: baris radius 16: `Episode 1` putih bold + `▷ 30.1K` abu; kanan lingkaran biru ikon play.
  - Mode **grid**: chip radius 16 (`Eps 1` biru = sedang/aktif) + `▷ 30.1K` + lingkaran biru play.
- **Saat scroll melewati hero**: muncul bar atas sticky: `←` + judul terpotong (`Kimetsu no Yaiba Movie 1: Mugenjo…`) di bar gelap transparan.

---

## 14. PLAYER

### 14.1 Portrait (halaman tonton)
- Area video hitam full-width rasio mengikuti video.
- **Overlay kanan-atas**: tombol `[ ] Fit` (ikon + teks putih bold) dan ikon fullscreen (4 sudut).
- **Kontrol tengah** (baris): `|◀` prev, `↺10` mundur 10 dtk, **tombol bulat besar** play/pause (putih, ikon hitam), `↷10` maju 10 dtk, `▶|` next.
- Kiri-bawah: `00:00 / 00:00` putih bold; kanan-bawah: `480p` dan `1x` putih bold.
- **Seek bar**: garis penuh lebar; isi merah `#EF4444`, track gelap, **thumb bulat merah ±16 px**, titik merah kecil di ujung kanan.
- Di bawah video, info: thumbnail poster kecil (radius 12) + judul putih bold 2 baris (`Kimetsu no Yaiba Movie 1: Mugenjou-hen - Akaza Sairai`) + baris abu `Episode 1  👁 30.1K  •  -`.
- Synopsis abu 2 baris + `…` + link cyan `Selengkapnya >`; diperluas → `Tutup >`.
- **Kartu "Bantu Admin"**: radius 20; tombol pill biru `👑 Bantu Seiklasnya` (teks putih 2 baris) + kanan teks putih `Bantu Admin seiklasnya untuk nonton iklan :D`.
- **Chip aksi** scroll horizontal (pill gelap `#1C2130`): `…p Quality` (Kualitas), `⤓ Download`, `ⓘ Report`, `↗ Share`.
- **Episode List**: heading + tombol collapse kotak biru-outline `^`; chip episode: yang aktif **putih penuh teks gelap** (`1`).
- **Kartu pedoman komentar**: ikon `ⓘ` biru + teks putih `Ingatlah untuk selalu memberikan komentar yang sopan dengan mengikuti Pedoman Komunitas Aniplay.` + link biru `Pelajari lebih lanjut >>`.
- Heading **`556 Comments`** (seksi komentar di bawah).
- **Bottom sheet "Pilihan Kualitas Video"** (dan "Pilihan Download Video"): sheet radius atas 28; drag handle; judul bold; 4 opsi:
  - `1080p (Premium)` **gold** — "Kualitas paling tinggi untuk tampilan maksimal, terbaik di jaringan cepat."
  - `720p (Bagus)` **orange** — "Gambar lebih tajam dan nyaman ditonton jika internet kamu cukup stabil."
  - `480p (Standar)` **hijau** — "Pilihan aman untuk harian, cukup jernih dan tetap hemat data."
  - `360p (Hemat)` putih — "Ringan untuk kuota dan cepat diputar di koneksi yang tidak stabil."
  - Yang dipilih diberi **centang putih** di kiri.

### 14.2 Landscape fullscreen
- Video full-bleed; **kiri-atas**: judul putih bold (`Jigokuraku`) + `Episode 3` abu.
- **Kanan-atas**: ikon **gembok** (lock), tombol `[ ] Fit`, ikon keluar fullscreen.
- **Slider vertikal kiri (brightness)**: label `2%` putih atas, track tipis, thumb putih, ikon **gear** bawah.
- **Slider vertikal kanan (volume)**: label `75%` putih atas, track, thumb, ikon **speaker** bawah.
- Kontrol tengah putih besar: `|◀`, `↺10`, tombol bulat putih play/pause hitam, `↷10`, `▶|`.
- Kiri-bawah `20:51 / 24:25`; kanan-bawah `480p` `1x`.
- Bawah: **seek merah** penuh lebar, thumb bulat merah besar, titik merah ujung kanan.
- **Mode terkunci** (…-130238): hanya video + **ikon gembok putih di kiri-tengah**; layar sentuh dikunci sampai gembok ditekan.

### 14.3 Mini player melayang (dalam app)
- Kartu radius 16, lebar ± 55% layar, **video 16:9 dengan subtitle tampil**, di bawahnya **footer bar gelap** berisi judul putih bold (`Jigokuraku`) + `Episode 3` abu kecil.
- **Bisa digeser bebas** ke mana saja (terlihat di 3 posisi berbeda pada 3 screenshot), mengambang di atas konten halaman lain (Home dll).
- Muncul saat keluar dari halaman player; konten di bawahnya tetap bisa di-scroll.

### 14.4 Mini player overlay di luar app (launcher)
- Saat app di-background, mini player tetap tampil sebagai **overlay di atas home screen Android**.
- Kontrol overlay: **gear** kiri-atas (bulat transparan), **X** kanan-atas, ikon **fit/expand** tengah-bawah.
- (Butuh izin "tampil di atas aplikasi lain" — opsional di web, wajib di APK.)

---

## 15. CATATAN ADAPTASI KE NANIME

Beberapa fitur di referensi tidak ada datanya di Nanime; pertahankan **posisi & gaya visual**, ganti isi:
| Referensi | Nanime |
|-----------|--------|
| Lencana pengguna: XP, Lvl, rank | **hilangkan** atau pakai statistik riwayat (jumlah tonton, menit) |
| Crystal / AniGames / Beli Premium | **ganti** jadi kartu ajakan "Lanjutkan Menonton" / info aplikasi |
| TOP LEADERBOARD / GIVEAWAY | **ganti** jadi carousel "Top Anime Mingguan" (data rating/views ada) |
| Public Diskusi (server chat) | **ganti** jadi banner info statis atau hapus |
| Subscribed | pakai **favorit**. Riwayat & favorit sudah ada di Supabase |
| SocialLine | **ganti** jadi halaman Profil (tab statistik sederhana) |
| Komentar | tidak ada data komentar → hilangkan seksi komentar |
| Bantu Admin / Download / Report | sesuaikan: Report → laporkan link rusak, Download → buka web |
| Kualitas 1080p Premium | pakai 1080p/720p/480p/360p apa adanya (tanpa label Premium) |
| Versi "AnibiPlay v1.4.9 (47)" | `Nanime v…` sesuai versi repo |
| Developer "noreasone" | **`Nata`** |

Aturan yang TIDAK boleh dilanggar (invarian Nanime): nama provider tidak pernah tampil, pesan error tunggal
`"Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti."`, login Google wajib,
ikon bukan emoji, logo `public/logo.jpg`, dan video tidak pernah hilang (mini player persisten).
