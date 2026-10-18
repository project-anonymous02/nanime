import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = '/tmp/Anibiplay-decompiled';
const referenceScreens = '/tmp/opencode/test';
const decodedAssets = '/tmp/Anibiplay/res/drawable';
const copiedAndroidResources = resolve(root, 'public/anibiplay-source/android-res');
const read = file => readFileSync(resolve(root, file), 'utf8');
const routes = read('src/App.tsx').match(/<Route path="[^"]+"/g)?.map(line => line.match(/"([^"]+)"/)?.[1]).filter(Boolean) || [];
const screenshots = existsSync(referenceScreens) ? readdirSync(referenceScreens).filter(file => /^Screenshot_.*\.jpg$/i.test(file)).sort() : [];
const rankAssets = existsSync(resolve(root, 'public/anibiplay-ranks')) ? readdirSync(resolve(root, 'public/anibiplay-ranks')).filter(file => file.endsWith('.png')).length : 0;
const affinityAssets = existsSync(resolve(root, 'public/anibiplay-affinity')) ? readdirSync(resolve(root, 'public/anibiplay-affinity')).filter(file => file.endsWith('.png')).length : 0;
const sourceDrawableCount = existsSync(decodedAssets) ? readdirSync(decodedAssets).filter(file => statSync(resolve(decodedAssets, file)).isFile()).length : 0;
const copiedFonts = existsSync(resolve(root, 'public/anibiplay-source/fonts')) ? readdirSync(resolve(root, 'public/anibiplay-source/fonts')).filter(file => /\.(ttf|otf)$/i.test(file)).length : 0;
const copiedGameArt = existsSync(resolve(root, 'public/anibiplay-source/games')) ? readdirSync(resolve(root, 'public/anibiplay-source/games')).filter(file => /\.(png|webp|jpg)$/i.test(file)).length : 0;
const copiedAndroidResourceCount = existsSync(copiedAndroidResources) ? walk(copiedAndroidResources) : 0;
const onboardingCapture = '/tmp/nanime-onboarding.png';
const migrationFiles = readdirSync(resolve(root, 'supabase/migrations')).filter(file => /^\d+_.*\.sql$/.test(file)).sort();

const coverage = [
  ['Onboarding / sign-in', 'src/views/Onboarding.tsx', 'Layout and gesture pattern ported; Google OAuth intentionally uses Nanime Supabase.'],
  ['Home, search, genres and weekly content', 'src/views/Home.tsx', 'Home now uses live Nanime user and affinity leaderboards plus a live Public Diskusi teaser. Free banner replaces paid CTA. AniBiPlay giveaway slide is not recreated without its data model.'],
  ['Anime ranking route', 'src/views/AnimeRanking.tsx', 'Dedicated ranking route uses the weekly ranking from the live Nanime catalog feed.'],
  ['User leaderboard route', 'src/views/Leaderboard.tsx', 'Dedicated leaderboard uses Supabase app-usage profiles and rank artwork; XP from AniBiPlay is not fabricated.'],
  ['Schedule, subscribed anime and history', 'src/views/Schedule.tsx', 'Dedicated pages and real catalog/library state exist; provider coverage and visual parity vary.'],
  ['Anime detail, episode selection and player', 'src/views/Detail.tsx', 'Player and episode flows exist; source AniBiPlay Media3 implementation is adapted to React/Capacitor and is not pixel-identical by assumption.'],
  ['SocialLine / public discussion', 'src/views/Community.tsx', 'Supabase-backed discussions, replies and activity leaderboard; AniBiPlay social feed data/API is not reused.'],
  ['Public Chat channels and live messages', 'src/views/PublicChat.tsx', 'Separate channel chat backed by Supabase Realtime; migration 014 adapts the AniBiPlay channel/message event model.'],
  ['Notifications and profile', 'src/views/Notifications.tsx', 'Subscription updates, profile tabs and developer message feed are integrated.'],
  ['Friends and direct chat', 'src/views/Friends.tsx', 'Supabase-backed Nanime friend graph and messages; migration 006.'],
  ['Watch party / Nobar', 'src/views/WatchParty.tsx', 'Nanime room model and live synchronization; migration 007.'],
  ['AniBiGames / clan features', 'src/views/Games.tsx', 'Nanime wallet, games and clan functions; migrations 008, 010 and 011. Paid access remains free.'],
  ['Affinity', 'src/views/Affinity.tsx', 'Nanime bond tiers, missions, privacy and leaderboard; migration 012; all eight AniBiPlay affinity tier icons are installed and used.'],
  ['Developer profile, rank art and messages', 'src/views/Profile.tsx', 'Developer check is the confirmed Supabase email; level 9999/display #1 and send composer; migration 013. AniBiPlay rank art is installed and mapped onto Nanime tiers.'],
  ['Settings, account lifecycle and OAuth callback', 'src/views/Settings.tsx', 'Nanime settings/session flow and nanime://auth-callback are retained.'],
];

const table = coverage.map(([area, file, detail]) => {
  const present = existsSync(resolve(root, file));
  return `| ${area} | ${present ? 'Ada di implementasi aktif' : 'Belum ada'} | ${detail.replaceAll('|', '\\|')} |`;
});
const lines = [
  '# Perbandingan kode AniBiPlay dan Nanime',
  '',
  `Dibuat otomatis pada ${new Date().toISOString()}. Nanime: \`${root}\`. Sumber dekompilasi: \`${source}\` (${existsSync(source) ? 'tersedia' : 'tidak tersedia'}).`,
  '',
  `Bukti lokal yang terdeteksi: ${screenshots.length} screenshot AniBiPlay di \`${referenceScreens}\`; ${sourceDrawableCount} drawable APK di \`${decodedAssets}\`; ${copiedAndroidResourceCount} resource APK tersalin utuh ke \`public/anibiplay-source/android-res\`; ${rankAssets}/10 aset rank, ${affinityAssets}/8 aset Afinitas, ${copiedFonts} font, dan ${copiedGameArt} aset game/sumber dipasang di Nanime; ${routes.length} deklarasi Route JSX di App.tsx. Capture onboarding Nanime ${existsSync(onboardingCapture) ? `tersedia di \`${onboardingCapture}\`` : 'belum tersedia'}.`,
  '',
  '| Area AniBiPlay | Implementasi Nanime | Perbedaan / catatan |',
  '|---|---|---|',
  ...table,
  '',
  '## Route Nanime aktif',
  '',
  routes.map(route => `- \`${route}\``).join('\n'),
  '',
  '## Bagian yang masih berbeda atau belum terverifikasi',
  '',
  '- AniBiPlay adalah APK Android yang didekompilasi (Compose/Media3), bukan source project Kotlin lengkap. Implementasi Nanime memakai React/Capacitor sehingga lifecycle dan rendering native tidak identik.',
  '- AniBiPlay mempunyai route/halaman tambahan yang belum memiliki padanan Nanime khusus: beberapa halaman kosmetik clan/avatar/banner/wallpaper/profile effect, serta AniPetZoo. Jangan anggap menu atau file yang ada sebagai parity tanpa memeriksa alur runtime.',
  '- Nanime memakai data Supabase dan katalog/provider Nanime; API privat AniBiPlay/Firebase tidak dipindahkan. Ranking di Home memakai data Nanime yang tersedia, bukan skor XP AniBiPlay; giveaway carousel sengaja tidak diberi data palsu.',
  '- Screenshot Welcome AniBiPlay #21 dibandingkan manual dengan capture Nanime; posisi, bidang gelap, font display dan teks sudah dikoreksi. Pixel-diff belum dijalankan karena screenshot APK menyertakan status/navigation bar Android sedangkan capture Chromium tidak.',
  '- Home, detail anime, search, library, profile, leaderboard, Public Chat, jadwal, detail/player, modal, dan viewport Android belum dicapture berdampingan. Kesetaraan visual penuh dan exact pixel parity belum terbukti.',
  '- Native Android PiP dan perilaku landscape perlu verifikasi build/device; build Android/emulator belum tersedia pada pemeriksaan ini.',
  '',
  '## Database dan autentikasi',
  '',
  `Migration Nanime yang tersedia: ${migrationFiles.map(file => `\`${file}\``).join(', ')}. Status live Supabase tidak dapat dibaca dari lingkungan ini (Supabase CLI/kredensial admin tidak tersedia); checkpoint repo sebelumnya mencatat 006–014 belum diterapkan, dan tidak ada migration produksi yang dijalankan sekarang. OAuth tetap memakai Supabase PKCE dan callback \`nanime://auth-callback\`. Migration 014 menambah channel Umum, pesan publik, RLS pemilik pesan, dan Realtime publication.`,
  '- `kusumanata767@gmail.com` mendapatkan tampilan Developer / Level 9999 / #1 melalui identitas Auth yang sudah terverifikasi. UUID Supabase tetap UUID kanonis; tidak diubah menjadi bilangan 1.',
  '- Tidak ada checkout atau entitlement berbayar dalam alur Nanime yang diperiksa. Akses fitur tidak dikunci dengan uang; ketersediaan stream tetap bergantung pada provider sumber.',
];

console.log(lines.join('\n'));

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const path = resolve(directory, entry.name);
    return sum + (entry.isDirectory() ? walk(path) : 1);
  }, 0);
}
