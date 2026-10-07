# Nanime
Nanime

Nanime adalah platform streaming dan katalog anime berbasis web dengan desain modern, responsif, dan berorientasi pada pengalaman pengguna.

Nanime dirancang sebagai website anime yang menggabungkan pencarian anime, katalog berdasarkan genre, rekomendasi, jadwal tayang, halaman detail anime, daftar episode, pencarian episode, video playback, serta sistem favorit dalam satu antarmuka yang sederhana namun tetap terasa premium.

Website ini menggunakan pendekatan visual yang terinspirasi dari desain modern iOS dan HiOS, terutama dalam penggunaan dark interface, rounded components, smooth animation, depth, blur, glow, dan interaksi yang responsif.

«Nanime is built to make discovering and watching anime simple, fast, and enjoyable.»

---

Table of Contents

- "About Nanime" (#about-nanime)
- "Main Features" (#main-features)
- "Home" (#home)
- "Anime Search" (#anime-search)
- "Anime Detail" (#anime-detail)
- "Episode System" (#episode-system)
- "Video Player" (#video-player)
- "Favorites" (#favorites)
- "Genre System" (#genre-system)
- "Anime Schedule" (#anime-schedule)
- "Recommendations" (#recommendations)
- "User Interface" (#user-interface)
- "Responsive Design" (#responsive-design)
- "Animation and Motion" (#animation-and-motion)
- "Assets" (#assets)
- "Routing" (#routing)
- "API Architecture" (#api-architecture)
- "Data Flow" (#data-flow)
- "Error Handling" (#error-handling)
- "Performance" (#performance)
- "Project Structure" (#project-structure)
- "Technology Stack" (#technology-stack)
- "Environment Configuration" (#environment-configuration)
- "Local Development" (#local-development)
- "Vercel Deployment" (#vercel-deployment)
- "Production Considerations" (#production-considerations)
- "Security" (#security)
- "API and Content Disclaimer" (#api-and-content-disclaimer)
- "Future Development" (#future-development)
- "Contributing" (#contributing)
- "License" (#license)

---

About Nanime

Nanime merupakan project web anime yang berfokus pada tiga hal utama:

1. Anime discovery
2. Anime information
3. Anime watching

Pengguna dapat membuka website, melihat halaman utama, mencari anime, memilih genre, membuka halaman detail, melihat daftar episode, memilih episode, dan menonton menggunakan sumber video yang tersedia melalui API yang digunakan oleh project.

Nanime tidak dirancang sebagai sekadar halaman katalog anime.

Tujuan utamanya adalah menciptakan pengalaman yang terasa seperti aplikasi streaming modern.

---

Main Features

Nanime memiliki beberapa fitur utama.

Home

Halaman utama berisi berbagai informasi anime yang dapat membantu pengguna menemukan anime baru.

Search

Pengguna dapat mencari anime berdasarkan judul dan, jika didukung oleh API, menggunakan filter genre atau parameter pencarian lainnya.

Genre

Anime dapat dikelompokkan berdasarkan genre.

Genre pada halaman detail juga dapat diklik sehingga pengguna dapat langsung melihat anime lain dengan genre yang sama.

Recommendations

Nanime dapat menampilkan rekomendasi anime berdasarkan data yang tersedia dari API.

Schedule

Jika API menyediakan data jadwal, Nanime dapat menampilkan jadwal anime yang sedang atau akan tayang.

Anime Detail

Setiap anime memiliki halaman detail yang berisi informasi utama, sinopsis, genre, episode, dan informasi lain yang tersedia dari API.

Episode Search

Pengguna dapat mencari episode tertentu dengan nomor episode.

Contohnya:

1000

atau:

400

Nanime kemudian mencari episode yang sesuai apabila episode tersebut tersedia pada sumber data.

Video Playback

Nanime menyediakan video player yang menggunakan sumber video aktual yang diberikan oleh API.

Format video mengikuti sumber yang tersedia, misalnya:

- MP4
- HLS
- format streaming lain yang didukung browser

Favorites

Pengguna dapat menyimpan anime favorit sehingga dapat ditemukan kembali melalui halaman:

/favorite

Untuk penggunaan tanpa sistem akun, data favorit dapat disimpan secara lokal menggunakan:

- LocalStorage
- IndexedDB

atau mekanisme client-side lain yang sesuai.

---

Home

Halaman Home merupakan halaman utama Nanime.

Ketika pengguna membuka website, halaman ini menjadi pusat navigasi utama.

Struktur halaman Home dirancang agar pengguna dapat langsung menemukan anime tanpa harus melakukan banyak navigasi.

Contoh bagian yang dapat ditampilkan:

- Featured Anime
- Recommended Anime
- Latest Anime
- Ongoing Anime
- Trending Anime
- Anime Genres
- Anime Schedule

Bagian yang benar-benar ditampilkan harus mengikuti data yang tersedia dari API.

Nanime tidak boleh membuat data anime palsu hanya untuk memenuhi tampilan.

Jika suatu data tidak tersedia dari API, UI harus menangani kondisi tersebut dengan baik.

---

Landing Experience

Nanime menggunakan aset khusus untuk memberikan identitas visual pada halaman utama.

Logo

File:

logo.jpg

Logo ditampilkan di bagian atas halaman.

Rasio yang digunakan:

1:1

File "logo.jpg" dianggap sebagai asset wajib.

Tidak diperlukan fallback image untuk file tersebut.

---

Dashboard Video

File:

dashboard.mp4

Video dashboard ditampilkan setelah judul Nanime.

Spesifikasi tampilan:

- Aspect ratio 16:9
- Autoplay
- Loop
- Muted
- Tanpa controls
- Tidak dapat di-click untuk membuka kontrol
- Tidak dapat di-drag
- Tidak dapat di-seek oleh pengguna
- Tidak dapat dihentikan melalui UI
- Responsive
- Rounded corners
- Premium border
- Subtle glow
- Subtle shadow

Video harus berjalan secara otomatis setelah kondisi browser memungkinkan autoplay.

Contoh konfigurasi:

<video
  autoplay
  muted
  loop
  playsinline
  preload="auto"
>
  <source src="/dashboard.mp4" type="video/mp4">
</video>

JavaScript dapat digunakan untuk menjaga perilaku video apabila diperlukan.

---

Anime Search

Search merupakan salah satu fitur inti Nanime.

Pengguna harus dapat mencari anime berdasarkan judul.

Contoh:

One Piece

Naruto

Jujutsu Kaisen

Bleach

Search harus menangani kondisi seperti:

- Query kosong
- Query tidak ditemukan
- Hasil terlalu banyak
- API error
- Loading
- Network error

UI search harus tetap responsif pada perangkat mobile.

---

Search Result

Hasil pencarian ditampilkan dalam bentuk card atau grid yang responsif.

Setiap item anime dapat menampilkan informasi seperti:

- Poster
- Judul
- Alternative title jika tersedia
- Status
- Episode
- Rating jika tersedia
- Tahun jika tersedia
- Genre tertentu jika tersedia

Data yang ditampilkan harus berasal dari API.

Nanime tidak boleh mengarang informasi yang tidak diberikan oleh sumber data.

---

Anime Detail

Ketika pengguna memilih anime, Nanime membuka halaman detail.

Contoh:

/anime/one-piece

atau format route lain yang lebih sesuai dengan identifier API.

Halaman detail menjadi pusat informasi sekaligus akses menuju episode anime.

---

Anime Cover

Cover anime ditempatkan pada area yang mudah terlihat.

Desain cover menggunakan:

- Rounded corners
- Shadow
- Border
- Subtle glow
- Responsive sizing

Cover dapat diletakkan di tengah atau menggunakan layout desktop yang lebih kompleks apabila desain memungkinkan.

---

Anime Information

Informasi anime dapat mencakup:

- Title
- Alternative title
- Synopsis
- Status
- Type
- Release date
- Year
- Rating
- Studio
- Duration
- Country
- Genre

Tidak semua field wajib ditampilkan apabila API tidak menyediakannya.

---

Synopsis

Sinopsis ditampilkan di bawah atau di sekitar informasi utama anime.

Untuk sinopsis yang panjang, UI dapat menggunakan:

- Expand / Collapse
- Read More
- Line clamp

Tujuannya agar halaman tetap ringkas pada mobile.

---

Genre System

Genre merupakan bagian penting dari navigasi Nanime.

Contoh genre:

Action
Adventure
Comedy
Drama
Fantasy
Romance
Sci-Fi
Sports
Horror
Psychological
Mystery

Genre yang tersedia harus mengikuti data API.

Genre pada halaman detail dapat menjadi tombol navigasi.

Contoh:

Romance

Ketika diklik, pengguna diarahkan ke halaman daftar anime dengan genre tersebut.

Contoh route:

/search?genre=romance

atau format route yang kompatibel dengan API.

---

Episode System

Halaman detail anime menyediakan daftar episode.

Contoh:

Episode 1
Episode 2
Episode 3
Episode 4
...
Episode 1000

Episode harus ditampilkan secara terstruktur sehingga tetap mudah digunakan ketika anime memiliki ratusan atau ribuan episode.

Untuk anime dengan jumlah episode yang sangat besar, implementasi dapat menggunakan:

- Pagination
- Virtualized list
- Lazy rendering
- Search episode
- Range selection

sesuai kebutuhan dan kemampuan API.

---

Episode Search

Nanime menyediakan pencarian episode.

Contoh pengguna memasukkan:

1000

Sistem mencari episode:

Episode 1000

Jika tersedia, episode tersebut dapat langsung dipilih.

Jika tidak tersedia, Nanime menampilkan pesan yang jelas.

Contoh:

Episode tidak ditemukan.

Pencarian episode tidak boleh menyebabkan seluruh halaman reload apabila tidak diperlukan.

---

Video Player

Video player merupakan bagian penting dari Nanime.

Player harus menggunakan sumber video yang benar-benar diberikan oleh sumber API.

Nanime tidak boleh:

- Mengarang URL video
- Menggunakan endpoint palsu
- Mengasumsikan format yang tidak didukung
- Menganggap semua sumber video sebagai MP4
- Mengabaikan struktur response API

Sistem player harus terlebih dahulu membaca struktur data API.

---

Supported Video Sources

Jika API menyediakan:

MP4

Player dapat menggunakan:

video/mp4

HLS

Jika API menyediakan playlist:

.m3u8

Nanime dapat menggunakan HLS apabila browser atau library player yang digunakan mendukungnya.

Implementasi harus menyesuaikan sumber aktual yang diberikan API.

---

Video Quality

Jika API menyediakan beberapa kualitas video, Nanime dapat memberikan pilihan seperti:

360p
480p
720p
1080p

Namun kualitas hanya ditampilkan apabila memang tersedia dari API.

---

Video Error Handling

Jika video gagal dimainkan, pengguna harus mendapatkan informasi yang jelas.

Contoh:

Video tidak dapat diputar.

Silakan coba lagi atau pilih sumber video lain jika tersedia.

UI tidak boleh hanya menampilkan player kosong tanpa penjelasan.

---

Favorites

Nanime menyediakan sistem Favorite.

Pengguna dapat menambahkan anime ke daftar favorit dari:

- Home
- Search
- Anime detail
- Recommendation
- Genre listing

Tombol Favorite harus memberikan feedback visual ketika status berubah.

Contoh:

♡

menjadi:

♥

atau icon equivalent yang digunakan oleh design system.

---

Favorite Persistence

Jika Nanime tidak menggunakan authentication, favorite dapat disimpan menggunakan browser storage.

Contoh:

localStorage

Data minimal dapat berupa:

{
  "id": "anime-id",
  "slug": "anime-slug",
  "title": "Anime Title",
  "image": "image-url"
}

Struktur sebenarnya harus disesuaikan dengan API.

Favorite harus tetap tersedia setelah pengguna:

- Refresh halaman
- Menutup browser
- Membuka kembali website

selama browser storage belum dihapus.

---

Anime Schedule

Jika API menyediakan jadwal anime, Nanime dapat menampilkan schedule.

Schedule dapat dikelompokkan berdasarkan:

Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday

Informasi yang dapat ditampilkan:

- Anime
- Episode
- Waktu tayang
- Status
- Thumbnail

Data schedule harus berasal dari API.

---

Recommendations

Nanime dapat menyediakan rekomendasi anime.

Sumber rekomendasi dapat berasal dari:

- API recommendation endpoint
- Related anime
- Genre similarity
- Trending anime
- Popular anime

Implementasi harus mengikuti kemampuan API yang digunakan.

---

User Interface

Nanime menggunakan desain visual yang terinspirasi oleh:

- iOS
- HiOS 17
- Modern streaming applications

Namun Nanime tidak dimaksudkan untuk menjadi salinan UI sistem operasi tertentu.

Tujuannya adalah mengambil prinsip desainnya:

- Clean
- Minimal
- Rounded
- Layered
- Responsive
- Smooth
- Premium

---

Dark Interface

Dark mode menjadi identitas utama Nanime.

UI harus menggunakan warna gelap sebagai dasar.

Contoh pendekatan:

Background
#050505
#080808
#0D0D0D

Warna tersebut hanya merupakan contoh.

Design system akhir harus menjaga:

- Contrast
- Readability
- Accessibility
- Visual hierarchy

---

Typography

Font harus terlihat modern dan nyaman dibaca.

Heading dapat menggunakan kombinasi warna seperti:

Blue → White

atau:

Red → Blue

Gradient digunakan secara terkontrol.

Jangan menggunakan terlalu banyak gradient pada satu halaman.

---

Cards

Anime card menjadi komponen utama Nanime.

Card dapat memiliki:

- Poster
- Title
- Metadata
- Rating
- Status
- Favorite button

Hover state pada desktop dapat menggunakan:

- Scale kecil
- Shadow
- Glow
- Image movement
- Overlay

Animasi harus tetap halus.

---

Buttons

Button menggunakan visual modern.

Karakteristik:

- Rounded
- Clear hierarchy
- Good contrast
- Smooth hover
- Smooth press state
- Touch friendly

Button tidak boleh terlihat seperti tombol HTML default.

---

Animation and Motion

Nanime menggunakan animasi untuk meningkatkan kualitas UX.

Animasi yang dapat digunakan:

- Page transition
- Card entrance
- Fade
- Slide
- Scale
- Blur
- Hover
- Press
- Loading animation
- Modal animation
- Search transition
- Favorite transition

Animasi tidak boleh mengganggu navigasi.

---

Motion Principles

Animasi harus:

- Smooth
- Fast enough
- Tidak berlebihan
- Tidak membuat halaman terasa lambat
- Tidak menghalangi interaksi

Gunakan easing yang natural.

Contoh:

transition:
  transform 0.25s ease,
  opacity 0.25s ease;

Nilai final harus disesuaikan dengan kebutuhan UI.

---

Responsive Design

Nanime harus dapat digunakan pada:

- Smartphone
- Tablet
- Laptop
- Desktop
- Large screen

Mobile merupakan prioritas penting karena sebagian besar pengguna kemungkinan mengakses website melalui smartphone.

Layout tidak boleh hanya mengecilkan ukuran desktop.

Layout harus benar-benar responsive.

---

Mobile Experience

Pada mobile:

- Navigation harus mudah dijangkau
- Search harus mudah digunakan
- Anime card tidak boleh terlalu kecil
- Button harus touch-friendly
- Text tidak boleh terpotong secara buruk
- Video harus memenuhi area yang sesuai
- Episode list harus mudah discroll
- Favorite button harus mudah ditemukan

---

Accessibility

Nanime harus memperhatikan accessibility.

Minimal:

- Semantic HTML
- Alt text pada gambar
- Keyboard navigation
- Visible focus state
- Sufficient contrast
- Accessible buttons
- Accessible labels
- Reduced motion support

Jika pengguna mengaktifkan:

prefers-reduced-motion

animasi yang tidak penting sebaiknya dikurangi.

---

Assets

Nanime memiliki dua asset utama yang wajib tersedia:

logo.jpg
dashboard.mp4

Keduanya harus digunakan secara langsung.

logo.jpg

Lokasi yang disarankan:

public/logo.jpg

dashboard.mp4

Lokasi yang disarankan:

public/dashboard.mp4

Jika struktur project menggunakan lokasi berbeda, route asset harus tetap valid pada production.

Tidak diperlukan placeholder.

Tidak diperlukan fallback asset.

---

Routing

Routing harus mendukung navigasi utama Nanime.

Contoh:

/home
/search
/favorite
/anime/:slug

Genre dapat menggunakan:

/search?genre=:genre

atau struktur route lain yang lebih cocok dengan API.

---

Suggested Route Structure

/
│
├── /home
├── /search
├── /favorite
│
└── /anime/:slug

Jika route root digunakan sebagai Home:

/

dapat melakukan redirect ke:

/home

atau langsung merender Home.

---

API Architecture

API merupakan bagian terpenting dari Nanime.

API harus digunakan berdasarkan hasil research dan dokumentasi sumber yang digunakan project.

Prioritas utama:

Actual API
    ↓
Actual endpoint
    ↓
Actual response
    ↓
Actual anime data
    ↓
Actual episode data
    ↓
Actual video source

Jangan membuat API palsu hanya agar UI terlihat bekerja.

---

API Integration Rules

Implementasi API harus memperhatikan:

- Endpoint
- HTTP method
- Query parameter
- Path parameter
- Response structure
- Pagination
- Error response
- Rate limit
- Authentication jika diperlukan
- CORS
- Video source
- Image source

Jika response API berubah, adapter atau normalization layer harus diperbarui.

---

API Adapter

Sebaiknya API dipisahkan dari komponen UI.

Contoh:

API
 ↓
Service / Adapter
 ↓
Normalized Data
 ↓
UI Components

Dengan pendekatan ini, perubahan API tidak harus memaksa perubahan seluruh UI.

---

Normalized Anime Object

Jika diperlukan, data API dapat dinormalisasi menjadi bentuk internal.

Contoh:

{
  "id": "string",
  "slug": "string",
  "title": "string",
  "image": "string",
  "synopsis": "string",
  "genres": [],
  "episodes": [],
  "status": "string",
  "year": null
}

Struktur tersebut hanya merupakan contoh konsep.

Field sebenarnya harus disesuaikan dengan response API yang digunakan Nanime.

---

Data Flow

Alur data Nanime secara umum:

User
  ↓
UI
  ↓
Router
  ↓
API Service
  ↓
External Anime API
  ↓
Response
  ↓
Data Normalization
  ↓
UI

Untuk video:

User
  ↓
Anime Detail
  ↓
Episode Selection
  ↓
Episode API
  ↓
Video Source
  ↓
Video Player

---

Loading State

Setiap proses API harus memiliki loading state yang jelas.

Contoh:

Loading anime...

atau skeleton UI.

Skeleton lebih disarankan dibanding spinner besar pada seluruh halaman.

---

Empty State

Jika API tidak menemukan hasil:

No anime found.

Empty state harus tetap memiliki desain yang sesuai dengan UI Nanime.

---

Error State

Jika API gagal:

Something went wrong.

Tambahkan tombol:

Try Again

jika memungkinkan.

---

Performance

Nanime harus memperhatikan performance sejak awal.

Beberapa teknik yang dapat digunakan:

- Lazy loading image
- Responsive image sizing
- Code splitting
- Dynamic import
- Debounced search
- API caching
- Request deduplication
- Virtualized episode list
- Lazy rendering
- Efficient animation
- Minimal JavaScript execution

---

Search Debouncing

Search input sebaiknya tidak langsung melakukan request pada setiap karakter.

Contoh:

O
On
One
One P
One Pi
One Pie
One Piec
One Piece

Request dapat ditunda sampai pengguna berhenti mengetik selama beberapa ratus milidetik.

---

Image Loading

Poster anime harus menggunakan lazy loading apabila tidak berada pada viewport.

Contoh:

<img
  loading="lazy"
  alt="Anime title"
/>

Image harus memiliki fallback visual ketika gagal dimuat.

Fallback visual tersebut berbeda dengan asset wajib "logo.jpg" dan "dashboard.mp4".

---

Project Structure

Struktur project harus dibuat sesederhana mungkin tanpa mengorbankan maintainability.

Contoh:

nanime/
│
├── api/
│   └── index.py
│
├── public/
│   ├── logo.jpg
│   └── dashboard.mp4
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── styles/
│   └── utils/
│
├── package.json
├── vercel.json
└── README.md

Struktur sebenarnya dapat berubah sesuai framework yang digunakan.

---

Backend

Python dan FastAPI dapat digunakan apabila sesuai dengan kebutuhan API proxy atau backend.

Contoh:

api/index.py

Backend bertanggung jawab untuk:

- API proxy
- Data transformation
- Request handling
- Error handling
- CORS handling
- Secure API communication

Jika Node.js atau Next.js lebih cocok untuk deployment dan API architecture, framework tersebut dapat digunakan.

Pemilihan teknologi harus berdasarkan kebutuhan nyata project, bukan sekadar preferensi.

---

Frontend

Frontend bertanggung jawab terhadap:

- UI
- Routing
- Animation
- Search interface
- Anime cards
- Detail page
- Episode interface
- Video player
- Favorite system

Komponen sebaiknya reusable.

Contoh:

AnimeCard
AnimeGrid
SearchBar
GenreChip
EpisodeList
VideoPlayer
FavoriteButton
LoadingSkeleton
ErrorState

---

Technology Stack

Stack dapat terdiri dari:

Frontend

- HTML
- CSS
- JavaScript

atau framework modern seperti:

- React
- Next.js

Backend

Jika diperlukan:

- Python
- FastAPI

atau:

- Node.js

Deployment

- Vercel

Storage

Untuk favorite tanpa authentication:

- LocalStorage
- IndexedDB

---

Vercel Deployment

Nanime dirancang agar website dapat di-deploy menggunakan Vercel.

Contoh konfigurasi:

vercel.json

Configuration harus disesuaikan dengan framework yang digunakan.

---

Important Vercel Considerations

Vercel digunakan terutama sebagai platform deployment untuk website dan API layer yang sesuai.

Tidak semua sumber video harus berada di Vercel.

External API dan external video source dapat tetap digunakan selama:

- API dapat diakses
- Video source dapat diputar oleh browser
- CORS tidak menghalangi penggunaan
- TOS dan legal restrictions diperhatikan

---

Environment Variables

Secret atau configuration penting tidak boleh ditulis langsung di source code.

Contoh:

API_BASE_URL
API_KEY

Jika memang diperlukan.

File:

.env

jangan dimasukkan ke repository apabila berisi secret.

Gunakan:

.env.example

untuk mendokumentasikan variable yang dibutuhkan.

---

Local Development

Clone repository:

git clone <repository-url>

Masuk ke directory:

cd nanime

Install dependencies:

npm install

atau sesuai package manager yang digunakan.

Kemudian jalankan development server:

npm run dev

Jika backend Python digunakan, environment Python juga harus disiapkan sesuai dependency project.

---

Production Build

Sebelum deployment, project harus dapat dibuat menggunakan production build.

Contoh:

npm run build

Kemudian lakukan test production secara lokal apabila framework mendukungnya.

---

Deployment Checklist

Sebelum deploy ke Vercel, pastikan:

- [ ] Build berhasil
- [ ] Routing bekerja
- [ ] Home bekerja
- [ ] Search bekerja
- [ ] Genre bekerja
- [ ] Favorite bekerja
- [ ] Anime detail bekerja
- [ ] Episode list bekerja
- [ ] Episode search bekerja
- [ ] Video player bekerja
- [ ] "logo.jpg" tersedia
- [ ] "dashboard.mp4" tersedia
- [ ] Mobile layout bekerja
- [ ] Desktop layout bekerja
- [ ] API production bekerja
- [ ] Tidak ada endpoint dummy
- [ ] Tidak ada URL video palsu
- [ ] Tidak ada secret yang bocor

---

Security

Nanime harus memperhatikan keamanan meskipun project bersifat frontend-heavy.

Jangan:

- Hardcode API key rahasia
- Menyimpan secret di frontend
- Mengekspos credential
- Menjalankan arbitrary user input sebagai code
- Menggunakan "eval()" tanpa alasan yang sangat kuat
- Mempercayai data API secara buta

Input pengguna harus divalidasi sebelum digunakan.

---

API and Content Disclaimer

Nanime merupakan project software untuk mengakses dan menampilkan data yang tersedia melalui sumber API yang digunakan oleh project.

Nanime tidak secara otomatis memiliki hak atas:

- Anime
- Artwork
- Video
- Subtitle
- Musik
- Character
- Logo pihak ketiga
- Metadata pihak ketiga

Hak atas konten tetap berada pada pemilik atau pemegang lisensi masing-masing.

Penggunaan API pihak ketiga juga harus mempertimbangkan:

- Terms of Service
- Copyright
- Licensing
- Rate limits
- API policies
- Regional restrictions

Jika suatu API atau sumber video tidak mengizinkan penggunaan tertentu, implementasi harus mengikuti ketentuan sumber tersebut.

---

Third-Party APIs

Nanime harus menggunakan API berdasarkan hasil penelitian dan sumber yang benar-benar tersedia.

Dokumentasi API yang digunakan sebaiknya dicantumkan di bagian ini.

Contoh:

API Name:
Official Documentation:
Base URL:
Authentication:
Rate Limit:
Video Support:

Jika sumber API berubah atau berhenti beroperasi, bagian integrasi API perlu diperbarui.

---

No Fake Data

Nanime tidak boleh menggunakan data palsu dalam production.

Contoh yang tidak boleh dilakukan:

const anime = {
  title: "One Piece",
  episodes: 1000
};

jika data tersebut tidak berasal dari API atau database project.

Mock data hanya boleh digunakan selama development/testing dan harus dipisahkan dari production.

---

Architecture Philosophy

Nanime menggunakan prinsip:

Real Data
    +
Clean Architecture
    +
Premium UI
    +
Fast Interaction
    +
Responsive Design

UI yang bagus tidak boleh mengorbankan fungsi.

API yang berfungsi tidak boleh menghasilkan UI yang buruk.

Performance tidak boleh dikorbankan hanya demi animasi.

---

Design Priority

Urutan prioritas pengembangan Nanime:

1. API dan video source
2. Data correctness
3. Routing
4. Search
5. Anime detail
6. Episode system
7. Favorite
8. Responsive layout
9. UI polish
10. Animation

Artinya, animasi tidak boleh menjadi alasan fitur utama gagal.

---

Future Development

Beberapa fitur yang dapat dikembangkan di masa depan:

User Account

Authentication dan sinkronisasi favorite antar perangkat.

Watch History

Menyimpan episode terakhir yang ditonton.

Contoh:

One Piece
Episode 1120
Continue Watching

Continue Watching

Pengguna dapat melanjutkan anime dari posisi terakhir.

Watchlist

Selain Favorite, pengguna dapat memiliki daftar:

Watching
Completed
Plan to Watch
Dropped

Advanced Search

Filter berdasarkan:

- Genre
- Year
- Status
- Type
- Rating
- Season

Multiple Video Sources

Jika API menyediakan beberapa sumber video, pengguna dapat memilih source yang tersedia.

Subtitle Selection

Jika video source menyediakan beberapa subtitle:

Indonesia
English
Japanese

Quality Selection

Jika tersedia:

360p
480p
720p
1080p

PWA

Nanime dapat dikembangkan menjadi Progressive Web App.

Dengan PWA, pengguna dapat mendapatkan pengalaman yang lebih menyerupai aplikasi native.

---

Project Goals

Tujuan utama Nanime adalah menciptakan website anime yang:

- Cepat
- Modern
- Responsif
- Mudah digunakan
- Visualnya premium
- Memiliki navigasi sederhana
- Memiliki data aktual
- Memiliki video playback yang benar-benar bekerja
- Nyaman digunakan pada smartphone

---

Development Philosophy

Nanime tidak dibuat hanya untuk terlihat bagus pada screenshot.

Setiap fitur harus benar-benar berfungsi.

Prinsip utama:

Function first.
Experience second.
Visual polish third.

Namun ketiganya tetap harus berjalan bersama dalam production.

---

Final Checklist

Core

- [ ] Nanime branding
- [ ] Home
- [ ] Search
- [ ] Favorite
- [ ] Anime detail
- [ ] Genre
- [ ] Episode list
- [ ] Episode search
- [ ] Video playback
- [ ] Recommendation
- [ ] Schedule

UI

- [ ] Dark interface
- [ ] Premium design
- [ ] iOS-inspired visual language
- [ ] HiOS-inspired visual language
- [ ] Smooth animation
- [ ] Responsive layout
- [ ] Mobile optimized
- [ ] Desktop optimized
- [ ] Accessible interaction

Assets

- [ ] "logo.jpg"
- [ ] "dashboard.mp4"

Technical

- [ ] API integration
- [ ] Error handling
- [ ] Loading state
- [ ] Empty state
- [ ] API caching where appropriate
- [ ] Search debounce
- [ ] Lazy loading
- [ ] Production build
- [ ] Vercel deployment

Quality

- [ ] No fake production endpoint
- [ ] No fake video URL
- [ ] No exposed secret
- [ ] No broken route
- [ ] No unnecessary dependency
- [ ] No excessive animation
- [ ] No unusable mobile layout

---

Nanime

Discover anime. Find your next story. Watch what you love.

Nanime is designed as a modern anime discovery and streaming experience built around real data, responsive interaction, and a premium dark interface.

---

Status

Development

Project status dapat diperbarui sesuai perkembangan implementasi.

---

License

Tambahkan license yang sesuai dengan repository dan seluruh dependency yang digunakan.

Contoh:

MIT License

Jika project menggunakan komponen, API, asset, atau library dengan license berbeda, masing-masing license harus tetap dihormati.
