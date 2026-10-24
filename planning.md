# NANIME REBUILD — planning.md

> Persistent working context. Update after each milestone. Source image: user ditcation "NANIME REBUILD DIRECTIVE" (2026-10-23).
> Indonesian UI. Referensi = APK Flutter "mobinime" (aset saja yang sedikitut). AniBiPlay diabaikan sepenuhnya kecuali badge rank.

## 1. Architecture & entry points
- Stack: React 19 + Vite 6 + TS 5.7 + Capacitor 6 (Android), Zustand, Supabase JS v2, hls.js, react-router-dom 7.
- Entry: `index.html` (tanpa splash boot) → `src/main.tsx` → `src/App.tsx` (routes) → `src/shell/Shell.tsx`.
- Core domain (JANGAN SENTUH): `src/core/**` (types, services: Catalog, SearchEngine, StreamExtractor, ImageResolver, ProviderAggregator, FallbackEngine, EpisodeMatcher, QualityNormalizer, DownloadAggregator, TitleIndex, Telemetry, ContentPolicy, CacheManager).
- State (Zustand): `src/state/{auth,app,library,player,settings,notifications}.ts` dipertahankan; `watchParty.ts` DIREMASTER dari app.
- Lib: `supabase.ts`, `deeplink.ts`, `backButton.ts`, `nav.ts`, `publicChat.ts`, `friends.ts`, `rank.ts`(baru), `AppUsageTracker` dipertahankan; `watchParty.ts`, `games.ts`, `affinity.ts`, `community.ts`(forum) DIHAPUS dari app (DB tidak disentuh).
- Supabase migrasi: backend siap → `004` (app usage + public profiles + leaderboard view), `006` (friends + DM), `014` (public chat), `015` (avatar visibility). `007/008/010/011/012` = fitur terlarang (tabel dibiarkan, UI tidak dibuat).
- Android: package `com.nanime.app`, OAuth callback `nanime://auth-callback` (intent-filter disuntik `scripts/setup-android-deeplink.sh`), `androidScheme: https`.

## 2. Reference materials — BUKTI TERJAMIN (sudah diinspeksi langsung)
- Referensi: `/sdcard/Download/nanime-referensi-apk` — APK Flutter **lengkap**: classes.dex + classes2.dex (Java glue), AndroidManifest.xml biner, resources.arsc, res/ 3.2MB.
- Identitas: package **com.mobinime.anime** (MainActivity, NormalTheme splash), Firebase app **Mobinime / mobinime-dcfa1**.
- Plugin Java terdeteksi dari dex strings: `flutter_android_downloader` (download episode), `flutter_local_notifications_plugin`, FCM `FlutterFirebaseMessagingService`, `wakelock_plus`, `url_launcher`, Google Sign-In (play-services-auth). SDK iklan/billing (AppLovin/Vungle/IronSource/Unity/billing) → DITOLAK (Nanime gratis bebas iklan).
- Visual identitas (TERMASUK CYA SEE):
  - Mascot: chibi Anya (pink); wordmark "Mobi nime" bubble font peach/cream; splash cover.jpg = navy gelap `#1e2c4f` + Anya di kursi oranye.
  - `anya-login.png` = ilustrasi Anya membentangkan tangan (onboarding/login).
  - Ikon tipe: `series.png` (film-strip merah/cyan), `movie.png` (clapperboard merah biru tua), `ova.png` (orb ungu-biru glossy), `live-action.png` (detektif pistol) — ditempatkan di Detail.
  - `google-logo.png` tombol login; `fb-logo.png` tersedia (tidak dipakai: Nanime Google-only).
- Batas keras: **libapp.so TIDAK ADA** → Dart AOT/UI code tidak bisa dibaca dari APK; layout layar tidak bisa dipetakan biner. Karena itu: UI rebuilt = aset asli + alur app anime standar; antivirus (app_name resolves ke short words) sudah dicatat.
- Ekstraksi berjalan: `public/ref/{fonts(B612×2), anya-login.png, cover.jpg, google-logo.png, fb-logo.png, icons/×4}`; branding logo = **`public/logo.jpg`** (per user).
- Badge rank: `public/anibiplay-ranks/` DIPERTAHANKAN (permintaan user).
- **Verifikasi parity aset (2026-10-23)**: `AssetManifest.json` APK = B612-Regular/Bold, anya-login.png, cover.jpg, fb-logo.png, google-logo.png, icons/{series,movie,ova,live-action}.png, mobinime.png, vip-min.png (+ aset plugin: awesome_dialog rive/flare, cupertino_icons, fluttertoast, wakelock no_sleep.js). Sembilan file `public/ref/*.png|jpg` + `fonts/B612×2` diverifikasi **byte-identik (sha256) dengan APK**; `vip-min.png` ikut dicopy ke ref (tidak ditampilkan: VIP dikecualikan); `mobinime.png` tidak dipakai (branding diganti `public/logo.jpg` per user); aset plugin tidak dipakai.
- **Batas data provider**: libapp.so TIDAK ADA dan dex/resources.arsc hanya memuat endpoint SDK iklan (adsbynimbus, applvn, taboola, app-measurement) + protobuf gateway/google. Proyek upstream open-source `Hana-Works/mobinime-api` (hono js) sudah **dihapus/pribadi** (404 live; indeks pencarian usang). Daftar provider mobinime TIDAK bisa direkonstruksi dari artefak mana pun; sumber alternatif = APK "Mobinime Next" (com.mobinime.nextanime) yang masih terpasang libapp.so, bila user mengizinkan fetch dari mobinime.com.
- **Kebijakan build (2026-10-23)**: APK HANYA dibangun via GitHub Actions (`.github/workflows/android.yml`, trigger tag/dispatch). Tidak menjalankan gradle/apk lokal lagi.

## 3. Fitur wajib (5) — backend kontrak
1. Public chat (014): channel global + pesan persisten, username publik, avatar, timestamp, RLS read semua/login; hapus punya sendiri.
2. Profiles (004): `nanime_profiles` (username, display_name, avatar_url, is_developer); Google avatar dipertahankan.
3. Leaderboard (004): view `nanime_leaderboard` order `app_usage_seconds desc` (stabil).
4. Friends (006): request/accept/reject/unfriend + DM.
5. Usage ranks: foreground-only (`AppUsageTracker` heartbeat 20s, RPC start/record/end). **Rank baru: 14 tier**, kumulatif menit [10,30,60,100,150,210,280,360,450,550,660,780,910,1020(=17h)]; nama/art: Stone, Bronze, Silver, Gold, Emerald, Diamond, Master, Mythic, Celestial, Eternal (art asli tier 1–10) → tier 11–14 pakai art Eternal dengan label I/II/III/IV; **tier Developer** (flag `is_developer`) badge art Eternal + label Developer.

## 4. Exclusions (JANGAN dibuat/tular UI)
Klan, AniGames, watch parties/nobar, guilds, crystal economy, daily rewards, affinity, forum/diskusi (permintaan user), iklan/subs/premium. Elektroan notifikasi: **episode baru dari anime yang di-subscribe saja**.

## 5. Navigasi & routes (hasil rekonstruksi)
- Onboarding (splash `logo.jpg`, disclaimer, login Google) → auth guard.
- Bottom nav 4 tab: **Home, Cari, Public Chat, Profil**; header Home → Notifikasi, Leaderboard, Teman, Pengaturan.
- Routes: `/home`, `/search`, `/public-chat`, `/profile` (+`/profile/:id`), `/detail/:id`, `/genre/:id`, `/schedule`, `/favorites`, `/history`, `/settings`, `/notifications`, `/leaderboard`, `/friends`, `/friends/chat/:id`, `/auth/callback`, `/onboarding`.
- Player = route full-screen `/watch/:id/:ep` dengan AdaptiveVideo (hls.js), kualitas, timeline resume, PIP native.

 ## 6. Execution order (status)
1. [x] Inspeksi project + referensi (menyelesaikan: aset, migrasi, versi tracker)
2. [x] planning.md dibuat
3. [x] Baseline: fix `src/ui/Cards.tsx:282` sintaks → `tsc` hijau
4. [x] Hapus legacy: views lama + fitur terlarang (routes/state/lib/UI), docs AniBiPlay, `public/anibiplay-source`, `public/anibiplay-affinity` (DIPERTAHANKAN: `public/anibiplay-ranks`, `public/logo.jpg`)
5. [x] Ekstrak aset referensi → `public/ref/`
6. [x] Rekonstruksi core UI (design system CSS baru: `src/styles/app.css` + tokens/base terisi segar; font B612 dari `public/ref/fonts`)
7. [x] 5 fitur integrasi
8. [x] tsc + vitest + vite build
9. [ ] APK: bangun hanya via GitHub Actions `.github/workflows/android.yml` (JANGAN jalankan gradle/apk lokal)

## 7. Build/test commands
- `npm run typecheck` (tsc --noEmit) · `npm test` (vitest run) · `npm run build` (tsc && vite build)
- APK: BANGUN HANYA via GitHub Actions `.github/workflows/android.yml` (trigger tag/dispatch). JANGAN jalankan gradle/apk lokal.
- Dev: `npm run dev` (localhost:5173)

## 8. Known blockers / notes
- WITHOUT libapp.so: layout mobinime tidak bisa dipetakan binary — UI dibangun dari aset asli + pola aplikasianime standar; tidak ada data palsu.
- Rank thresholds murni client-side dari `app_usage_totals.seconds` (tidak perlu migrasi baru). Konsisten dgn RPC 004 (p_session, heartbeat ≤ 30s).
- Cleanup kemarin: className di-strip; `styles/app.css` yang lama sudah dipangkas ke tokens+base; semua rebuilt minggu bersama.
- **Audit provider live (2026-10-24)**:
  - Otakudesu `https://otakudesu.blog`: home, search, detail, `/jadwal-rilis/`, `/genre-list/` semuanya `200`. Adapter legacy tetap layak.
  - Samehadaku `https://samehadaku.li`: search (`/?s=…`), detail, `/anime/?status=ongoing|completed`, `/anime/?type=movie`, dan `/genres/{slug}/` hidup. Halaman episode memakai `<IFRAME SRC=…>` huruf besar; `parseIframeEmbeds` tetap menemukannya. `/jadwal-rilis/`, `/genre/`, `/schedule/`, `/jadwal/`, `/daftar-genre/`, `/genre-list/` = `404`; `/batch/` episode = `404`.
  - Wajik commit `d61442f10493452608af82db29f565b0ef1d37fe`: Samehadaku controller `Status: OFF` dan parser kosong; hanya Otakudesu/Kuramanime. Config Kuramanime `v8.kuramanime.tel` mati.
  - Kuramanime root `https://kuramanime.link` redirect ke `https://v20.kuramanime.ing`. Home, `/anime?search=…`, `/quick/ongoing`, `/schedule?scheduled_day=all`, `/properties/genre`, detail, dan `#episodeLists[data-content]` hidup. `X-Frame-Options: SAMEORIGIN` melarang iframe halaman episode. Tapi provider ini **TIDAK** dipakai (sesuai arahan terbaru user).
  - Registry disempitkan kembali ke **Otakudesu → Samehadaku → Animeku** (+ Nekopoi pada pencarian opt-in). `httpProbe` dikembalikan ke HEAD-only.
- Selesai milestone → tulis ringkasan ke file ini bagian 9.

## 9. Progress log
- 2026-10-23: planning.md dibuat. Baseline error Cards.tsx:282 diketahui.
- 2026-10-24: audit live Otakudesu/Samehadaku/Kuramanime. `KuramanimeProvider.ts` sempat disiapkan lalu dihentikan sesuai arahan user — tidak ada provider baru yang dipakai; registry kembali ke empat sumber asli (Otakudesu, Samehadaku, Animeku, Nekopoi) dan `httpProbe` HEAD-only tetap dipertahankan.
