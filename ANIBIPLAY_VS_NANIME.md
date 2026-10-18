# Perbandingan kode AniBiPlay dan Nanime

Dibuat otomatis pada 2026-10-18T13:24:50.956Z. Nanime: `/workspace/nanime`. Sumber dekompilasi: `/tmp/Anibiplay-decompiled` (tersedia).

Bukti lokal yang terdeteksi: 47 screenshot AniBiPlay di `/tmp/opencode/test`; 69 drawable APK di `/tmp/Anibiplay/res/drawable`; 193 resource APK tersalin utuh ke `public/anibiplay-source/android-res`; 10/10 aset rank, 8/8 aset Afinitas, 19 font, dan 47 aset game/sumber dipasang di Nanime; 31 deklarasi Route JSX di App.tsx. Capture onboarding Nanime tersedia di `/tmp/nanime-onboarding.png`.

| Area AniBiPlay | Implementasi Nanime | Perbedaan / catatan |
|---|---|---|
| Onboarding / sign-in | Ada di implementasi aktif | Layout and gesture pattern ported; Google OAuth intentionally uses Nanime Supabase. |
| Home, search, genres and weekly content | Ada di implementasi aktif | Home now uses live Nanime user and affinity leaderboards plus a live Public Diskusi teaser. Free banner replaces paid CTA. AniBiPlay giveaway slide is not recreated without its data model. |
| Anime ranking route | Ada di implementasi aktif | Dedicated ranking route uses the weekly ranking from the live Nanime catalog feed. |
| User leaderboard route | Ada di implementasi aktif | Dedicated leaderboard uses Supabase app-usage profiles and rank artwork; XP from AniBiPlay is not fabricated. |
| Schedule, subscribed anime and history | Ada di implementasi aktif | Dedicated pages and real catalog/library state exist; provider coverage and visual parity vary. |
| Anime detail, episode selection and player | Ada di implementasi aktif | Player and episode flows exist; source AniBiPlay Media3 implementation is adapted to React/Capacitor and is not pixel-identical by assumption. |
| SocialLine / public discussion | Ada di implementasi aktif | Supabase-backed discussions, replies and activity leaderboard; AniBiPlay social feed data/API is not reused. |
| Public Chat channels and live messages | Ada di implementasi aktif | Separate channel chat backed by Supabase Realtime; migration 014 adapts the AniBiPlay channel/message event model. |
| Notifications and profile | Ada di implementasi aktif | Subscription updates, profile tabs and developer message feed are integrated. |
| Friends and direct chat | Ada di implementasi aktif | Supabase-backed Nanime friend graph and messages; migration 006. |
| Watch party / Nobar | Ada di implementasi aktif | Nanime room model and live synchronization; migration 007. |
| AniBiGames / clan features | Ada di implementasi aktif | Nanime wallet, games and clan functions; migrations 008, 010 and 011. Paid access remains free. |
| Affinity | Ada di implementasi aktif | Nanime bond tiers, missions, privacy and leaderboard; migration 012; all eight AniBiPlay affinity tier icons are installed and used. |
| Developer profile, rank art and messages | Ada di implementasi aktif | Developer check is the confirmed Supabase email; level 9999/display #1 and send composer; migration 013. AniBiPlay rank art is installed and mapped onto Nanime tiers. |
| Settings, account lifecycle and OAuth callback | Ada di implementasi aktif | Nanime settings/session flow and nanime://auth-callback are retained. |

## Route Nanime aktif

- `/`
- `/home`
- `/search`
- `/genre/:genreUrl/:genreTitle`
- `/schedule`
- `/favorites`
- `/subscribed`
- `/history`
- `/profile`
- `/profile/:userId`
- `/settings`
- `/notifications`
- `/community`
- `/socialline`
- `/public-chat`
- `/ranking/anime`
- `/leaderboard`
- `/friends`
- `/friends/search`
- `/friends/:friendId`
- `/chat/:friendId`
- `/affinity`
- `/profile/affinity`
- `/watch-party`
- `/watch-party/:id`
- `/games`
- `/anibi-games`
- `/detail/:id`
- `*`
- `/auth/callback`
- `*`

## Bagian yang masih berbeda atau belum terverifikasi

- AniBiPlay adalah APK Android yang didekompilasi (Compose/Media3), bukan source project Kotlin lengkap. Implementasi Nanime memakai React/Capacitor sehingga lifecycle dan rendering native tidak identik.
- AniBiPlay mempunyai route/halaman tambahan yang belum memiliki padanan Nanime khusus: beberapa halaman kosmetik clan/avatar/banner/wallpaper/profile effect, serta AniPetZoo. Jangan anggap menu atau file yang ada sebagai parity tanpa memeriksa alur runtime.
- Nanime memakai data Supabase dan katalog/provider Nanime; API privat AniBiPlay/Firebase tidak dipindahkan. Ranking di Home memakai data Nanime yang tersedia, bukan skor XP AniBiPlay; giveaway carousel sengaja tidak diberi data palsu.
- Screenshot Welcome AniBiPlay #21 dibandingkan manual dengan capture Nanime; posisi, bidang gelap, font display dan teks sudah dikoreksi. Pixel-diff belum dijalankan karena screenshot APK menyertakan status/navigation bar Android sedangkan capture Chromium tidak.
- Home, detail anime, search, library, profile, leaderboard, Public Chat, jadwal, detail/player, modal, dan viewport Android belum dicapture berdampingan. Kesetaraan visual penuh dan exact pixel parity belum terbukti.
- Native Android PiP dan perilaku landscape perlu verifikasi build/device; build Android/emulator belum tersedia pada pemeriksaan ini.

## Database dan autentikasi

Migration Nanime yang tersedia: `001_init.sql`, `002_community_safe.sql`, `003_watch_profile_consistency.sql`, `004_app_usage_and_public_profiles.sql`, `005_watch_profile_key_compat.sql`, `006_friends_and_direct_messages.sql`, `007_watch_parties.sql`, `008_nanime_games.sql`, `009_threaded_anime_comments.sql`, `010_clan_chat.sql`, `011_clan_color_gacha.sql`, `012_affinity_bonds.sql`, `013_developer_profile_messages.sql`, `014_public_chat.sql`. Status live Supabase tidak dapat dibaca dari lingkungan ini (Supabase CLI/kredensial admin tidak tersedia); checkpoint repo sebelumnya mencatat 006–014 belum diterapkan, dan tidak ada migration produksi yang dijalankan sekarang. OAuth tetap memakai Supabase PKCE dan callback `nanime://auth-callback`. Migration 014 menambah channel Umum, pesan publik, RLS pemilik pesan, dan Realtime publication.
- `kusumanata767@gmail.com` mendapatkan tampilan Developer / Level 9999 / #1 melalui identitas Auth yang sudah terverifikasi. UUID Supabase tetap UUID kanonis; tidak diubah menjadi bilangan 1.
- Tidak ada checkout atau entitlement berbayar dalam alur Nanime yang diperiksa. Akses fitur tidak dikunci dengan uang; ketersediaan stream tetap bergantung pada provider sumber.
