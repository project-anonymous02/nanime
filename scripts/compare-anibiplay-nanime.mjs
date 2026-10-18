import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reference = [
  { name: 'Onboarding, login & callback', files: ['src/views/Onboarding.tsx', 'src/views/AuthCallback.tsx', 'src/state/auth.ts'], evidence: 'AniBiPlay onboarding screenshots; Nanime deliberately keeps Supabase OAuth and nanime://auth-callback.' },
  { name: 'Home, search, schedule & anime detail', files: ['src/views/Home.tsx', 'src/views/Search.tsx', 'src/views/Schedule.tsx', 'src/views/Detail.tsx'], evidence: '47-screen inventory in map-anibiplay.md.' },
  { name: 'Anime subscription, history & notifications', files: ['src/views/Favorites.tsx', 'src/views/History.tsx', 'src/views/Notifications.tsx', 'src/lib/subscriptions.ts'], evidence: 'AniBiPlay subscribed anime flow mapped to Nanime favorites and catalog updates.' },
  { name: 'Player, floating player & external PiP', files: ['src/ui/PlayerOverlay.tsx', 'src/ui/AdaptiveVideo.tsx', 'src/lib/nativePip.ts', 'native/'], evidence: 'Player portrait/landscape/mini-player screenshots; native support is platform-dependent.' },
  { name: 'Friends, requests & direct chat', files: ['src/views/Friends.tsx', 'src/lib/friends.ts', 'supabase/migrations/006_friends_and_direct_messages.sql'], evidence: 'Verified AniBiPlay FriendRequest and Chat DTO families; Nanime uses independent Supabase tables.' },
  { name: 'Watch party / Nobar', files: ['src/views/WatchParty.tsx', 'src/lib/watchParty.ts', 'supabase/migrations/007_watch_parties.sql'], evidence: 'JADX socket events include party state, episode change, playback, presence and chat.' },
  { name: 'AniBiGames equivalent', files: ['src/views/Games.tsx', 'src/lib/games.ts', 'supabase/migrations/008_nanime_games.sql'], evidence: 'Nanime has wallet, crystal ledger, clan membership, join flow and daily claims.' },
  { name: 'Clan chat and cosmetics', files: ['src/views/Games.tsx', 'supabase/migrations/010_clan_chat.sql', 'supabase/migrations/011_clan_color_gacha.sql'], evidence: 'Clan messages and color catalog/gacha are server-validated.' },
  { name: 'Afinitas', files: ['src/views/Affinity.tsx', 'src/lib/affinity.ts', 'supabase/migrations/012_affinity_bonds.sql'], evidence: 'DTOs confirm four tiers, partner, slots, privacy, cooldown, missions and levels.' },
  { name: 'AniPetZoo', files: [], evidence: 'Only AnnouncementFeaturesDto.herocard_anipetzoo and the feature label occur in available JADX output; no pet DTO, route, API contract or resource files were recovered.' },
  { name: 'Profile, comments, favorites & history', files: ['src/views/Profile.tsx', 'src/views/PublicProfile.tsx', 'src/views/Comments.tsx', 'supabase/migrations/009_threaded_anime_comments.sql'], evidence: 'Nanime has own/public profiles, comments, favorites/history and community relations.' },
  { name: 'Developer role, badge and profile messages', files: ['src/lib/developer.ts', 'src/views/Profile.tsx', 'supabase/migrations/013_developer_profile_messages.sql'], evidence: 'Nanime identity is asserted by confirmed Supabase Auth email; account UUID remains unchanged.' },
  { name: 'Paid membership and premium quality gates', files: ['src/views/Home.tsx', 'src/ui/AdaptiveVideo.tsx'], evidence: 'No paid entitlement implementation exists in Nanime; free callout replaces the pay CTA and playback quality has no premium gate.' },
  { name: 'Settings & account lifecycle', files: ['src/views/Settings.tsx', 'src/state/auth.ts', 'src/state/watchParty.ts'], evidence: 'Playback preferences and sign-out cleanup; Google OAuth callback remains Nanime-owned.' },
];
const rows = reference.map(item => {
  const missing = item.files.filter(file => !existsSync(resolve(root, file)));
  const status = item.files.length === 0 ? 'BLOCKED: no implementation contract' : missing.length ? `MISSING: ${missing.join(', ')}` : 'IMPLEMENTED IN SOURCE';
  return { ...item, status };
});
const lines = [
  '# AniBiPlay vs Nanime — source comparison',
  '',
  `Generated from the current Nanime working tree. APK JADX output checked at ${existsSync('/tmp/Anibiplay-decompiled') ? '`/tmp/Anibiplay-decompiled`' : 'not available'}.`,
  '',
  '> This is a source/inventory comparison, not a pixel-diff result. Nanime has local screenshots in `screenshot/`, but the original AniBiPlay screenshot files are not in this workspace; the extracted JADX resource directory contains 0 files, and no emulator is attached. Exact screenshot parity and runtime Android PiP therefore remain unverified.',
  '',
  '| AniBiPlay area | Nanime source status | Basis / known difference |',
  '|---|---|---|',
  ...rows.map(row => `| ${row.name} | ${row.status} | ${row.evidence.replaceAll('|', '\\|')} |`),
  '',
  '## Identity and free access',
  '',
  '- UI identity is Nanime. Supabase Google OAuth and `nanime://auth-callback` remain the Nanime flow.',
  '- `kusumanata767@gmail.com` is assigned Developer / Level 9999 / display tag #1 by migration 013 after confirmed-email verification. Supabase Auth IDs are UUIDs, so the underlying UUID is retained; `#1` is a presentation tag, not a rewritten auth primary key.',
  '- The profile has a Developer-only composer and an authenticated-user announcement feed. RLS validates the sender against `auth.users`.',
  '- No paid feature gate exists in the current Nanime source. The home CTA now says all features are free. Catalog availability and actual stream quality still depend on the selected external provider.',
  '',
  '## Supabase changes',
  '',
  'Apply migrations 006–013 in numerical order to the Nanime Supabase project. They add friend/direct-message, watch-party, game/clan, threaded-comment, clan-chat/cosmetic, affinity, and developer-profile-message data and RPC/RLS rules. These migrations are additive; they do not assign an integer Auth ID or modify OAuth settings. Do not run only 013 before its prerequisite migration 002 profile columns exist.',
  '',
  '## Remaining verified gaps',
  '',
  '- AniPetZoo is discoverable only as a home hero-card feature flag (`herocard_anipetzoo`) and label in the available DEX. No entity model, API endpoint contract, navigation route, or local asset files were recoverable, so implementing a pretend pet system would not be a reconstruction.',
  '- `screenshot/` contains Nanime captures, while the original AniBiPlay captures listed in `map-anibiplay.md` are absent; exact pixel comparison cannot be run from this checkout. The decoded APK resource directory is also empty.',
  '- Native external PiP needs an Android build/device verification. Browser PiP does not provide identical overlay behavior on every platform.',
];
console.log(lines.join('\n'));
