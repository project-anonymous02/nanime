# AniBiPlay vs Nanime — source comparison

Generated from the current Nanime working tree. APK JADX output checked at `/tmp/Anibiplay-decompiled`.

> This is a source/inventory comparison, not a pixel-diff result. Nanime has local screenshots in `screenshot/`, but the original AniBiPlay screenshot files are not in this workspace; the extracted JADX resource directory contains 0 files, and no emulator is attached. Exact screenshot parity and runtime Android PiP therefore remain unverified.

| AniBiPlay area | Nanime source status | Basis / known difference |
|---|---|---|
| Onboarding, login & callback | IMPLEMENTED IN SOURCE | AniBiPlay onboarding screenshots; Nanime deliberately keeps Supabase OAuth and nanime://auth-callback. |
| Home, search, schedule & anime detail | IMPLEMENTED IN SOURCE | 47-screen inventory in map-anibiplay.md. |
| Anime subscription, history & notifications | IMPLEMENTED IN SOURCE | AniBiPlay subscribed anime flow mapped to Nanime favorites and catalog updates. |
| Player, floating player & external PiP | IMPLEMENTED IN SOURCE | Player portrait/landscape/mini-player screenshots; native support is platform-dependent. |
| Friends, requests & direct chat | IMPLEMENTED IN SOURCE | Verified AniBiPlay FriendRequest and Chat DTO families; Nanime uses independent Supabase tables. |
| Watch party / Nobar | IMPLEMENTED IN SOURCE | JADX socket events include party state, episode change, playback, presence and chat. |
| AniBiGames equivalent | IMPLEMENTED IN SOURCE | Nanime has wallet, crystal ledger, clan membership, join flow and daily claims. |
| Clan chat and cosmetics | IMPLEMENTED IN SOURCE | Clan messages and color catalog/gacha are server-validated. |
| Afinitas | IMPLEMENTED IN SOURCE | DTOs confirm four tiers, partner, slots, privacy, cooldown, missions and levels. |
| AniPetZoo | BLOCKED: no implementation contract | Only AnnouncementFeaturesDto.herocard_anipetzoo and the feature label occur in available JADX output; no pet DTO, route, API contract or resource files were recovered. |
| Profile, comments, favorites & history | IMPLEMENTED IN SOURCE | Nanime has own/public profiles, comments, favorites/history and community relations. |
| Developer role, badge and profile messages | IMPLEMENTED IN SOURCE | Nanime identity is asserted by confirmed Supabase Auth email; account UUID remains unchanged. |
| Paid membership and premium quality gates | IMPLEMENTED IN SOURCE | No paid entitlement implementation exists in Nanime; free callout replaces the pay CTA and playback quality has no premium gate. |
| Settings & account lifecycle | IMPLEMENTED IN SOURCE | Playback preferences and sign-out cleanup; Google OAuth callback remains Nanime-owned. |

## Identity and free access

- UI identity is Nanime. Supabase Google OAuth and `nanime://auth-callback` remain the Nanime flow.
- `kusumanata767@gmail.com` is assigned Developer / Level 9999 / display tag #1 by migration 013 after confirmed-email verification. Supabase Auth IDs are UUIDs, so the underlying UUID is retained; `#1` is a presentation tag, not a rewritten auth primary key.
- The profile has a Developer-only composer and an authenticated-user announcement feed. RLS validates the sender against `auth.users`.
- No paid feature gate exists in the current Nanime source. The home CTA now says all features are free. Catalog availability and actual stream quality still depend on the selected external provider.

## Supabase changes

Apply migrations 006–013 in numerical order to the Nanime Supabase project. They add friend/direct-message, watch-party, game/clan, threaded-comment, clan-chat/cosmetic, affinity, and developer-profile-message data and RPC/RLS rules. These migrations are additive; they do not assign an integer Auth ID or modify OAuth settings. Do not run only 013 before its prerequisite migration 002 profile columns exist.

## Remaining verified gaps

- AniPetZoo is discoverable only as a home hero-card feature flag (`herocard_anipetzoo`) and label in the available DEX. No entity model, API endpoint contract, navigation route, or local asset files were recoverable, so implementing a pretend pet system would not be a reconstruction.
- `screenshot/` contains Nanime captures, while the original AniBiPlay captures listed in `map-anibiplay.md` are absent; exact pixel comparison cannot be run from this checkout. The decoded APK resource directory is also empty.
- Native external PiP needs an Android build/device verification. Browser PiP does not provide identical overlay behavior on every platform.
