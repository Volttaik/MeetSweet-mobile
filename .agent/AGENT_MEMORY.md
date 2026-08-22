# Agent Memory — MeetSweet

This file is the durable hand-off context for the Freebuff coding agent. It is
committed to git so that if the workspace (a temp dir) is reset, the next agent
can reconstruct full context from this file plus `git log`.

## Repos

- **Mobile app** — `Volttaik/MeetSweet-mobile` (this workspace root).
  Remote `origin` = `https://github.com/Volttaik/MeetSweet-mobile.git`.
  A local platform backup remote `gitsafe-backup` = `git://gitsafe:5418/backup.git`.
- **Server** — `Volttaik/Meetsweet` (a separate repo; clone it into
  `.meetsweet-server/` inside this workspace when you need to edit it).
  Remote = `https://github.com/Volttaik/Meetsweet.git`.

## Environment

- Replit, PNPM workspace. Expo (Metro) dev server on port **5000**.
- Mobile API base: `https://meetsweet.space` (production). Override via
  `EXPO_PUBLIC_API_URL`. Every request needs header `X-Client-App-Id: meetsweet-mobile`
  (the client's `services/api.ts` adds it automatically).
- EAS account: `prcon` / `prcons-team`. Build profile `preview` = Android APK (internal).

## Live infrastructure

- **Turso** is the production database (a libsql URL + auth token; provided
  in-session, do not commit the token).
- **Server** is a Next.js app deployed to **Vercel** → `https://meetsweet.space`
  (config at `Meetsweet/server/vercel.json`, `next.config.ts`).

## What has already been fixed & pushed

Original 12-area bug-fix pass, then a 3-hour audit pass. Both repos pass
`tsc --noEmit`. Highlights:

- Explore video posts silently dropped → `buildVideoRow`/`buildShortRow` now emit
  flat `creator_*` fields.
- Subscription correctness → `subscribe()` returns authoritative `subscriber_count`;
  creator route returns `subscription_tier`; client applies state immediately.
- Creator profile showed internal IDs → `getCreatorById` no longer falls back to the
  route param for `username`/`name`.
- Chat opening spinner → shimmer skeleton with fade-in.
- Chat header menu glitch → rewritten `MsChatHeaderMenu` (slide+fade, separated backdrop).
- Normal post comments → reuse the shared `CommentsModal` (Shorts/Video sheet).
- Idempotent chatroom open → checks local room cache by peer id before creating.
- Server notification privacy bug → `push.ts` now respects `user_settings.notif_*`.
- `transactions.reference` unique index declared in Drizzle schema (already applied in prod).

## Latest session (current work)

1. **Explore "no content"** — `creatorEmbeddedInItem` in
   `MeetSweet-mobile/services/explore.ts` used the POST `id` instead of
   `creator_id` when flat creator fields were present, so previews never matched
   their author and every item was dropped. Fixed to use
   `src.creator_id ?? src.creatorId ?? src.id`.
2. **Creator pages showing "Creator" placeholder** — root cause was the live DB:
   every user had `is_creator = 0` and `devatron` had `is_active = 0`, so
   `GET /api/creators/:id` returned "Creator not found". Ran a one-off Turso UPDATE
   to set `is_creator = 1, is_active = 1, role = 'creator'` for the 4 users who own
   published posts (devatron, ifeoma, iamdublin, durk). Verified endpoints return
   real data afterward.
3. **Chat shimmer redesign** — `MsShimmerChatMessage`/`MsShimmerChatList` now use
   deterministic widths (no `Math.random` flicker), the real bubble colours
   (`#1C1C23` incoming, `#28282F` outgoing), and the chat-room skeleton input bar
   mirrors the real composer (sticker / pill / attach / camera / accent send).

## Task pass: input alignment, video seek, chat glitches, chat loading

Focused bug-fix pass (no backend changes). All of it is uncommitted in the working tree.

1. **Input/keyboard alignment (Android)** — root cause: TextInput's internal font
   padding + baseline variance push text/caret off-centre in fixed-height rows.
   Shared fix: `paddingVertical: 0`, `includeFontPadding: false`,
   `textAlignVertical: 'center'` on the style of every single-line input:
   `MsInput` (shared), `MsSearchModal`, `OTPInput`, `MsChatSearch`, GIF search,
   sticker search, comment input (`MsCommentRoomPanel`), explore search,
   profile edit name, auth/register/settings fields, create-album title + price,
   create-post title, wallet custom amount, creator-dashboard/payout inputs,
   messages modal search, comments-sheet input. Multiline inputs only got
   `includeFontPadding: false` (caption inputs) — never `textAlignVertical: center`.
2. **Video seek tracker** — seek-bar was snapping back to the beginning on the
   SECOND interaction because a stale async seek-release from drag #1 cleared
   `scrubbingRef` while drag #2 was in flight, and the next status tick (old
   position) snapped the thumb. Fixed with a monotonic gesture generation
   counter (`scrubGenRef` / `fsScrubGenRef`): release only unlocks position
   tracking if it's still the latest gesture; terminate bumps the gen. Both
   inline and fullscreen seekers.
3. **Chat glitches** — chat screen: `Chat` component is now ALWAYS mounted
   (header/input/controls never unmount/remount while messages load).
   Conversations list (`messages.tsx`): FlatList is always mounted; the loading
   shimmer is an absolute overlay that crossfades out (no hard cut).
4. **Chat loading architecture** — ONLY the message area shows the shimmer.
   IMPORTANT BUGFIX vs earlier draft: the shimmer overlay is `position:absolute`
   full-screen with opaque `T.BG` — it must start BELOW the header
   (`top: insets.top + 58`) or it paints over the back button/avatar/name.
   The chat header + input bar render immediately; shimmer fades 240ms.

Mobile typecheck passes: `cd MeetSweet-mobile && npx tsc -p tsconfig.json --noEmit`.
NOTE: the file-tool `str_replace` cannot address `app/chat-room/[chatRoomId].tsx`
(brackets are treated as a glob); use a python one-liner via terminal for that file.

## Task pass: content pricing fixes (albums / shorts / subscription price)

Focused pricing pass — no backend architecture changes. Both repos typecheck
with `tsc --noEmit`. Changes are uncommitted in both working trees.

1. **Albums are purchase-only**
   - `MeetSweet-mobile/app/create-album.tsx`: removed the Visibility tier options
     (Public/Subscribers/Draft) and the free/paid toggle — the creator sets a
     price; albums are always `visibility: 'public'` + priced (validated ≥ ₦1).
   - `MeetSweet-mobile/app/create-post.tsx`: removed the Album card from the
     content-type picker (albums only via `/create-album`) and hid the tier
     picker for the `album` type too.
   - `MeetSweet-mobile/services/albums.ts` `createAlbum()` now sends
     `unlock_price` — the backend only accepted `unlock_price`/`price_credits`,
     so the old `price` field was silently stripped (zod) and every album
     published FREE. Backend `POST /albums` now also accepts `price` as an alias.
2. **Shorts** — the tier picker was already hidden for shorts; the preview now
   shows "Public" instead of a Free tier badge. No tier selection anywhere in
   shorts creation.
3. **Creator subscription price showing ₦0** — root cause was the DATA, not the
   UI: the 3 active creators (durk, iamdublin, ifeoma) had no priced
   `creator_settings` row (missing or 0; devatron's ₦200 row belongs to a
   soft-deleted account). `resolveBasePrice()` faithfully returned 0.
   - Live DB backfilled: all active creators now have
     `creator_settings.subscription_price = 200`. Verified live:
     `GET https://meetsweet.space/api/creators` returns 200 (plus 400).
   - Server code: `lib/services/pricing.ts` now exports
     `DEFAULT_SUBSCRIPTION_PRICE = 200`; become-creator, creator/settings GET
     auto-create + PATCH insert, creator/verification, and wallet bank-details
     insert paths all set it explicitly; schema default updated to 200 (SQLite
     can't ALTER an existing column default, so the code paths carry it);
     `scripts/migrate.ts` gained idempotent backfill entries for unpriced and
     missing creator rows.
   - `/api/users/:username` now resolves the price via `resolveBasePrice`
     instead of returning the raw `profiles.subscription_price`.
4. **Pricing UI follow-up (after subscription fix landed)** — verified the
   full album flow end-to-end: create (`/create-album`, price-only) →
   publish (always `public` + priced) → `app/album/[id].tsx` shows the price,
   locks items, and unlocks via `purchaseAlbum` (backend deducts wallet and
   marks purchased).
   - `create-post.tsx` hardened: since the Album card was removed from the
     content-type picker, a stale draft (`contentType: 'album'`) or
     `?type=album` param could crash on `selectedCt` (undefined) — clamped the
     draft restore to post/video/shorts, dropped the `?type=album` param, and
     made `selectedCt` fall back to the post entry.
   - Post-creation onboarding copy updated: no longer tells creators to pick
     Free/Subscriber/Subscriber+ “for each post” — now says Shorts are public
     and Albums are purchase-only.
   - Confirmed no tier options remain anywhere in Short or Album creation UI
     (only display badges in feeds). Mobile typecheck passes.

## Fix: album/media upload "Missing 'file' field in form data"

User reported this error when publishing an album (cover/media upload).
Server (`/api/upload` alias of `server/app/api/media/upload/route.ts`) is
correct and unchanged — it does `req.formData()` then `formData.get("file")`
and requires the part to be a real file. Client was the problem:

- `services/media.ts` appended the legacy React Native FormData file object
  `{ uri, type, name }`. On Android (RN 0.81 / Expo SDK 54) that object can
  silently drop the file part, so the server sees no `file` field. On the
  web preview the browser FormData stringifies the object to "[object Object]"
  — same server error.
- Fix (rewrote `services/media.ts`):
  - Native: `new File(uri)` from `expo-file-system` (a native Blob) appended
    to FormData and sent with `expo/fetch`'s `fetch`. expo/fetch serializes
    the File by reading its bytes (`entry.bytes()`), so the part is always
    present. Works with file:// and content:// URIs. Guard: `file.size === 0`
    throws a clear "could not be read" error (covers stale draft URIs).
  - Web: resolve the picker's blob: URI via `fetch(uri).blob()` and append a
    real Blob (with `mimeType` fallback when `blob.type` is empty).
  - `expo/fetch` on web IS the browser fetch, so the web branch is safe.
  - Kept the response contract (`{ id, url, media_type }`) and added a
    401 token-refresh retry via a new `refreshAccessToken()` export in
    `services/api.ts` (uploads now bypass `apiFetch`, which did refresh).
- Why this works mechanically: Expo's runtime (`Expo.fx` → `winter/runtime`)
  already patches the global FormData with `append(blob, filename)` support
  and `entries()`; `expo/fetch`'s `convertFormDataAsync` uses `entries()` +
  the part's `bytes()` for expo-file-system Files (RN's built-in fetch would
  need a `uri` on the part, which the File spread doesn't guarantee).
- Mobile typecheck passes (`cd MeetSweet-mobile && npx tsc -p tsconfig.json --noEmit`).

## Task pass: final small fixes (chat shimmer / album purchase / ownership states / feedback modals / short play button)

Focused pass over the previous UI work. Mobile + server both typecheck (`npx tsc
--noEmit`). Mobile changes are uncommitted in the working tree; server changes
are uncommitted in `.meetsweet-server` (pricing pass + this).

1. **Chat shimmer (remove fake white text)** — `MsShimmerChatMessage` renders
   ONE clean shimmer block per bubble (real bubble colours #1C1C23/#28282F,
   tail corner, 10px padding, deterministic widths). No white text-line shapes
   inside bubbles anymore. Chat room still uses `MsShimmerChatList` in the
   message area only; header/composer render immediately.
2. **Album purchase integrity** — server `POST /albums/:id/purchase` (aliases
   `unlock/route.ts` POST) runs an atomic tx: wallet debit (guarded
   `gte(balance, price)`), creator credit/create-wallet, two `transactions`
   rows, `album_unlocks` insert. Owner / free / already-purchased short-circuit
   with `{ unlocked: true, already_unlocked: true }` (no charge). Insufficient
   balance → 402 `INSUFFICIENT_BALANCE`, tx rolls back, client shows the error
   modal (never success). `loadAlbum` marks `unlocked` for owner, free albums,
   and purchasers (items stay URL-nulled + `is_locked` otherwise). Client
   `purchaseAlbum()` only reports `purchased` from the server response;
   `app/album/[id].tsx` shows "Already unlocked" (info) vs "Album unlocked"
   (success) accordingly and refreshes the query.
3. **Ownership / subscription states** — `app/creator/[id].tsx`:
   - Own profile → "You" badge; Subscribe + Message rows hidden
     (`isOwnProfile = currentUser.id === creatorFullProfile.userId`).
   - Base subscriber → "Subscribed" + separate Upgrade button.
   - Subscriber+ → badge only, no Upgrade.
   - SubscribeSheet shows Unsubscribe (with confirm dialog) for subscribers;
     `cancelSubscription()` in `services/subscriptions.ts` posts
     `/subscriptions/:id/cancel`, success only on `{ cancelled: true }`.
   - Explore (`explore.tsx`): already-subscribed creators route to the profile
     instead of re-subscribing; card shows "Subscribed" (no Subscribe/Upgrade).
4. **Toasts → styled modals** — new `components/MsFeedbackModal.tsx` (center
   card, success/error/info icons, haptics). Wired into: album purchase/unlock,
   creator subscribe/upgrade/unsubscribe, explore subscribe, and
   creator-dashboard price updates. Default toasts remain only for unrelated
   minor flows (profile/photo/post edits, payouts, wallet validation) per the
   "do not modify unrelated features" constraint.
5. **Short play button** — `shortsIconOpacity` starts at 0 and is hidden again
   whenever the short goes active (was flashing over the poster/first frame).
   The centre control only appears after the user taps the short.

## Server repo push blocked — commit is backed up as a patch

The `Volttaik/Meetsweet` server repo is NOT in this Freebuff workspace's
credential scope (only `MeetSweet-mobile` is), so `git push` from
`.meetsweet-server` returns `403 Permission denied to freebuff-web[bot]` even
though the repo is readable. The pricing-pass commit is committed locally:

- Commit `03851d7` — "Make creator pricing authoritative and default
  subscription price explicit" (10 files, +105/−10). `git -C
  .meetsweet-server status` shows `main...origin/main [ahead 1]`.
- Full backup patch saved at the workspace root:
  `0001-Make-creator-pricing-authoritative-and-default-subsc.patch`
  (reapply with `git -C .meetsweet-server am
  /home/daytona/codebase/0001-*.patch` after a fresh clone).

To push: the user must connect `Volttaik/Meetsweet` in this Freebuff project
so the workspace mints a credential scoped to it; then plain
`git -C .meetsweet-server push origin main` works. Do NOT use a PAT.

## Task pass: reactive inputs, media delivery, connection states, self-awareness, instant UI

Mobile + server both typecheck (`npx tsc --noEmit`). Uncommitted in both trees.

1. **Reactive keyboard** — root cause: `KeyboardAwareScrollViewCompat`
   existed but NO screen used it (forms used plain ScrollView, so Android
   keyboards covered fields). Swept the shared component onto every form
   scroll: wallet (both panes), auth, register (key={step} remount replaces
   scrollToTop), create-album details, creator-dashboard, edit-post,
   create-post details. `KeyboardAwareScrollViewCompat` now defaults
   `bottomOffset={12}`. Bottom-sheet modals with inputs (settings edit
   sheets, profile edit modals, creator-payout bank/withdraw sheets) switched
   from RN KeyboardAvoidingView (iOS-only padding) to
   react-native-keyboard-controller's KeyboardAvoidingView with
   `behavior="padding"` so Android sheets rise above the keyboard too
   (precedent: MsCommentsSheet). Wallet preset chips compacted (auto-size to
   label; no stretch, no minWidth).
2. **Video delivery** — storage is Cloudflare R2; media is served directly
   from the public bucket URL or presigned GETs (R2 handles Range requests
   natively for seeking). Added `CacheControl: public,
   max-age=31536000, immutable` on PutObject in `media/upload/route.ts`
   (also covers `/api/upload` alias) — repeat views/seeks hit the R2 CDN
   edge instead of origin. No transcoding/ABR: not practical on the current
   infra (Vercel + R2, no ffmpeg); would need Mux/Cloudflare Stream.
3. **Connection states** — `hooks/useNetwork.ts`: offline grace
   `60s → 120s` (per task: ~2 min before "Disconnected"); "slow" now
   requires 2 CONSECUTIVE slow probes (SLOW_STREAK_REQUIRED) so the banner
   doesn't flicker on one blip. `MsOfflineBanner` copy no longer claims
   "showing cached content".
4. **Ownership (live server data)** — already live-data based everywhere;
   filled the gaps: Shorts feed hides the Subscribe pill on your own shorts
   (`isOwnCreator = currentUser.id === item.creator.id`); content/[id] hides
   Subscribe on own posts. Creator profile "You" badge, album
   `isUnlockedByMe` (owner = unlocked), post cards `isOwn` — all from server
   + authenticated user, none from local cache.
5. **Subscription staleness** — root cause: `GET /api/creators` catalog did
   NOT compute the viewer's subscription state, so Explore re-showed
   "Subscribe" after refresh/new session. Server catalog now takes
   `optionalAuth` and returns `subscribed_to_creator`/`subscribedToCreator`
   + `subscription_tier`/`subscriptionTier` per viewer (active subs only);
   the existing client normalizer already reads those fields.
6. **Instant UI** — already-optimistic: feed card likes, content/[id] likes
   + comment submit (temp id), shorts likes, comment likes, album purchase
   (unlock only after server confirm), subscribe (state applied on
   response). Added the missing piece: content/[id] post comment COUNT now
   increments optimistically on send and decrements on delete (was static
   `post.commentCount`).
7. **No new caching** — nothing added; fixed the banner copy that implied
   cached content exists. The pre-existing SQLite posts feed cache
   (lib/posts-db) is untouched (removing it is out of scope and risky).

## Server push STILL blocked (as of latest session)

Workspace credential remains scoped to `MeetSweet-mobile` only — `git push` to
`Volttaik/Meetsweet` still returns `403 denied to freebuff-web[bot]`. Local
server commits ahead of origin: `03851d7` (pricing) + `ef1f983` (catalog
subscription state + media CacheControl). Both backed up as patches at the
workspace root (`0001-Make-creator-...patch`, `0001-Catalog-...patch`),
committed into the mobile repo so they survive resets. Reapply with `git am`.

## 2026-08-17 — INSTALL-GUIDE IMAGES + /install-help PAGE (uncommitted)

User asked for images teaching people how to install the Android APK (Play
Protect / "App not installed" instructions). No AI image tool exists in this
workspace, so the images are hand-authored branded vector illustrations
(SVG) rasterized to PNG with sharp — crisp at any size, matching the site's
dark + pink (#C45A72) theme.

SERVER (in `.meetsweet-server`, uncommitted):
- `server/public/install-help/step-{1..6}-*.svg` + `*.png` (1080) +
  `*@2x.png` (2160):
  1 download (Keep/Open), 2 install + Play Protect "Install anyway",
  3 turn off Play Protect scanning, 4 allow unknown apps, 5 "App not
  installed" checklist, 6 done/home screen.
- `server/app/install-help/page.tsx` — step cards + FAQ + download CTA
  (served at https://meetsweet.space/install-help).
- `server/app/page.tsx` — download section now links to /install-help.

MOBILE repo root (workspace root, uncommitted):
- `scripts/render-install-images.mjs` + `scripts/fonts/` (DejaVu Sans ttf
  + auto-generated fonts.conf) — re-renders PNGs: `node
  scripts/render-install-images.mjs`. Fonts are needed because this
  container has NO system fonts, so librsvg drops all text without them
  (verified: 0 text px before, ~1.5k after).

Server typecheck passes (`cd .meetsweet-server/server &&
./node_modules/.bin/tsc --noEmit`). Not committed/pushed in either repo.

## How to resume / verify

```bash
# Mobile typecheck
cd MeetSweet-mobile && npx tsc -p tsconfig.json --noEmit
# Server typecheck (after pnpm install in .meetsweet-server/server)
cd .meetsweet-server/server && pnpm exec tsc --noEmit
# Push mobile (origin has no token embedded — pass it inline)
git push https://<GH_TOKEN>@github.com/Volttaik/MeetSweet-mobile.git main
# Push server (its origin embeds the token)
cd .meetsweet-server && git push origin main
```

## Credentials (NOT committed here — re-provide in session)

- GitHub push token (`ghp_…`) — needed to push the mobile repo.
- Expo / EAS token — needed for `eas build`.
- Turso DB URL + auth token — needed to touch the live DB.

These values are in the Freebuff conversation history; retrieve them from there
or regenerate. Do not commit raw secrets to the public repos.

## Known remaining work / notes

- **Paystack `charge.success` webhook** is still missing — wallet credit relies on
  the client calling `verify-paystack`. Needs a webhook secret + signature check.
- **Legacy `/conversations` + `/messages` routes** are no longer referenced by the
  mobile app (it uses `/chat-rooms` + `/comment-rooms`) — candidates for removal.
- Junk assets were removed from HEAD but still exist in git history; purging needs
  a `git filter-repo` history rewrite.
- The mobile repo's `origin/main` local tracking ref can look stale because pushes
  were done by inline URL — fetch by URL to confirm true remote state.

## 2026-08-16 — FINAL UI FIXES + BACKEND ISSUE AUDIT (completed)

MOBILE FIXED (typecheck clean):
- Vibration setting: lib/haptics.ts now gates every haptic call on a persisted
  device pref (@ms_haptics_enabled); first-haptics prompt modal
  (MsHapticsPrompt, mounted in app/_layout.tsx); Settings > General toggle.
- Chat shimmer: MsShimmerChatList/Message now EXACTLY mirror the notification
  shimmer loader (42px avatar, 12/10px lines, 7px gap, 16/10 row padding,
  default 1100ms sweep), only adapted to chat bubbles (real bubble colours,
  deterministic widths, no fake text).
- Account isolation: @ms_blocked_ key now user-scoped
  (@ms_blocked_<userId>_<username>) so Account B never inherits A's block
  state. Chat cache clearing on logout/login/session-expiry already in place.
- Comment sheet keyboard: composer gets guaranteed clearance above keyboard
  (keyboardDidShow listener → 18px bottom padding) on top of the KAV lift.
- Albums verified end-to-end (owner/purchaser unlocked, locked gate +
  styled purchase sheet, success only on server confirm).

BACKEND ISSUE (documented in BACKEND_ISSUES.md at repo root):
- Server commits 03851d7 (pricing) + ef1f983 (catalog subscription state +
  media cache) committed locally but NOT pushed (Freebuff credential scoped
  to MeetSweet-mobile only) — live Vercel lacks them; see the report for the
  full contract + patch backups.

## 2026-08-17 — ALBUM, CHAT, COMMENTS & ACCOUNT CLEANUP (completed)

MOBILE FIXED (typecheck clean):
- Album preview: locked albums now show NO content preview — info + price +
  Purchase only; item grid renders only after server-confirmed unlock.
- Chat shimmer: static bubble blocks (real bubble colours), 42px avatar,
  notification sizing; NO animated shimmer inside bubbles; list nudged lower.
- Chat isolation: chat list (messages tab) and message text (chat room) no
  longer paint from local cache — the server is the render source; cache is
  only a mirror/media store. clearChatCache on logout/login stays.
- Comment sheet: adaptive keyboard — sheet lifts by keyboard height (animated),
  maxHeight capped so it never goes full-screen; input + comments stay visible;
  sheet returns naturally on close.
- Media cache: already expo-file-system based (services/chat-media.ts) —
  images/video/audio persisted per room; voice notes persisted on send.
- Deleted posts: removeCachedPost purges server-confirmed deletes from the
  feed cache so they can't resurrect after restart.

SERVER (committed locally e4f8214, NOT pushed — credential scope; patch backed
up as 0001-Delete-accounts-consistently-free-identity-for-rereg.patch):
- DELETE /users/me: atomic full cleanup (tokens, content soft-delete, chat
  rows, subscriptions cancelled both ways, notifications/settings/wallet/social
  rows, PII → unique placeholders) so the email/username can re-register.
- Register: duplicate check ignores soft-deleted accounts.
- Login: rejects deleted accounts.
- requireAuth/optionalAuth: live account check (deleted token stops working
  immediately; fail closed).

## 2026-08-17 — ALBUM MULTI-MEDIA UPLOAD (completed, uncommitted)

Root cause was NOT the upload pipeline (that was already multi-item and live:
mobile uploads each item -> media_ids; server attaches -> album_items) — it was
the DISPLAY path: album screen navigated to /content/[item.id] which fetches
POSTS, but album item ids are media row ids -> 404 -> "Content unavailable".

MOBILE:
- app/album/[id].tsx: album items render directly from album.items (media
  rows) in the grid; tapping opens a fullscreen modal (MsVideoPlayer /
  MsMediaLoader) on the item's own mediaUrl/thumbnailUrl. No post lookup.
- app/create-album.tsx: item picker now allowsMultipleSelection (up to the
  20-item cap, respecting current count), every picked asset appended in
  picker order -> sort_order matches; cover stays single image.

SERVER (uncommitted):
- server/app/api/albums/route.ts: media_ids validated to belong to the
  uploader (inArray + uploader_id) and the create fails loudly if any id is
  invalid/foreign instead of silently creating an empty album.

Both repos typecheck clean (tsc --noEmit). Not committed/pushed yet.

## 2026-08-17 — VIEW COUNT, MEDIA PERFORMANCE & SECURITY HARDENING (uncommitted)

ONE VIEW PER ACCOUNT (server-authoritative):
- New post_views table (unique post_id+user_id, accumulated watched_seconds,
  counted flag) + migration entry in server/scripts/migrate.ts (replaces the
  legacy drop). MUST RUN `npx tsx scripts/migrate.ts` (or drizzle push) before
  views track on live.
- New server/lib/services/views.ts recordView(): anonymous never counted; long
  video threshold 60s; short (<60s) threshold = 90% watch-through (min 2s);
  unknown-duration short fallback 5s; atomic accumulate+count exactly once.
- Rewrote posts/videos/shorts [id]/view routes to delegate (body now accepts
  watch_duration_secs delta + optional video_duration_secs; returns counted,
  view_count, required_seconds). OLD BEHAVIOR was a blind +1 per request.
- Mobile: MsVideoPlayer accumulates watch deltas (inline + fullscreen, flush
  every ~4s + on pause/end/unmount; seek/loop-safe); shorts feed + content
  detail report deltas via services/content.ts trackShortView/trackVideoView
  and reflect the server's returned view_count.

SECURITY AUDIT (all VERIFIED server-side, no gaps found):
- Wallet/transactions/settings/payments: requireAuth + auth.user.userId scoped.
- Chat rooms: listVisibleRoomIds(auth userId). Withdrawals: atomic conditional
  debit. Subscriptions: transactional existing-active dedupe.
- Locked/paid media: posts/[id] + buildVideoRow/buildShortRow null video_url
  when locked; videos/[id]+shorts/[id] 403 TIER_REQUIRED; albums null locked
  item URLs. Deleted resources excluded (deleted_at) everywhere.
- Media delivery: R2 presigned GET (byte-range) + immutable CacheControl
  (already pushed ef1f983) — no public media proxy exists to leak.

Both repos typecheck clean (tsc --noEmit). Not committed/pushed.

## 2026-08-17 — LONG-PRESS ACTIONS + FINAL POLISH (uncommitted mobile, server committed)

MOBILE FIXED (typecheck clean):
- MsPostCard: "Not Interested" (hidePost -> hidden_posts) and "Hide Creator"
  (hideCreator -> POST /users/:username/mute) were DEAD no-ops — now real,
  persist server-side, drop the card/creator immediately via PostActionsContext
  (hiddenIds + hiddenCreatorIds) and show styled MsFeedbackModal feedback.
- Both actions are HIDDEN for creators the viewer already subscribes to
  (subscribedToAuthor prop; Home feed always subscribed; Explore gates via
  server flag + session set; creator profile uses its isSubscribed state).
- Explore creator menu: fake "Mute" (Alert-only) replaced with real Hide
  Creator; Subscribe hidden when already subscribed; Copy/Block feedback moved
  to the styled modal. Featured/recommended + feed items filter hidden.
- Home feed + Explore filter hiddenIds/hiddenCreatorIds in-session.

SERVER (committed locally, NOT pushed — credential scope; patch backed up as
0001-Add-hide-creator-mute-endpoint-and-exclude-hidden-cre.patch):
- POST /users/:username/mute (idempotent) -> muted_users.
- Posts home/generic + videos + shorts + explore content & creator catalog
  exclude muted/blocked creators and hidden posts (getHiddenCreatorIds /
  getHiddenPostIds helpers in services/content.ts).
- Posts feed rows now include subscribed_to_creator/subscribedToCreator.

Polish: action-row touch targets (minHeight 34) on post cards.

## 2026-08-17 — CREATOR ACCESS, HEADER, MEDIA & NAV FINAL PASS (pushed mobile, server committed+patch)

MOBILE (pushed f8e585c, ca2ef24):
- Creator profile subscriber-gated: server reports content_locked; when locked
  the screen shows ONLY header/subscribers + Subscribe gate (no tabs, no content
  counts, no content fetch); on server-confirmed subscribe the content section
  fades in (Animated) and re-fetches. Owner/Subscriber+/base-tier states unchanged.
- Creator Dashboard icon button added to Home top bar (isCreator-gated), using
  new pushOnce()/replaceOnce() nav dedupe (lib/nav.ts) — no duplicate stacking.
  Settings dashboard row also uses pushOnce.
- Adaptive media: all video resizeMode now CONTAIN (shorts too — no cropping,
  black letterbox); album fullscreen video preview uses fillContainer.
- Verified already in place (no changes): native Slider seek (pink), deep links
  (scheme+intent filters+associatedDomains+/s resolver+server web fallback),
  server authz on locked media.

SERVER (committed 20cff0d locally, NOT pushed — credential scope; patch backed up
as 0001-Gate-creator-profile-content-behind-subscription-and-fi.patch):
- GET /creators/:id adds content_locked (owner=false).
- /creators/:id/posts|videos|shorts return { locked: true, <list>: [] } for
  unsubscribed non-owners (creator profile fully gated; Explore unaffected).
- scripts/migrate.ts: post_views migration split into single statements (libsql
  rejects multi-statement strings) so the migration runner works.

## 2026-08-17 — MEDIA LOADING AUDIT + UPLOAD METADATA (pushed mobile c446c46, server committed 791c97a + patch)

MEDIA PIPELINE AUDIT (findings):
- Serving: direct from Cloudflare R2 (R2_PUBLIC_BASE_URL stable public URL,
  UUID keys, CacheControl public,max-age=31536000,immutable at PUT) — NOT
  proxied. Range requests supported natively (R2 + expo-av progressive).
  Presigned URLs (7d) only used for credential downloads.
- No transcoding/adaptive streaming exists (Vercel serverless, no FFmpeg).
  Biggest remaining bottleneck: large originals (up to 500MB) + possible
  moov-at-end MP4s = slower first frame on mobile. Recommended upgrade:
  Cloudflare Stream or Mux (see report).
- Thumbnails: create-post generates poster client-side via expo-video-thumbnails
  and PATCHes media.thumbnail_url. Feed cards = static thumbs (no per-card
  players); shorts prebuffer the adjacent item. Videos play only on the detail
  screen (no feed player mounts).
- View counting unchanged (post_views, 60s/90%-of-short, server-authoritative).

CHANGES:
- Mobile: uploadMedia() now accepts optional {width,height,durationSecs} and
  best-effort PATCHes /media/:id after upload. create-post + create-album pass
  the picked asset's real dimensions/duration. Result: media rows carry true
  aspect ratio + duration -> player sizes instantly (no 16:9 layout jump),
  seek bar knows duration immediately.
- Server: buildVideoRow/buildShortRow now return width/height top-level + per
  media item (posts/[id] + feeds already did). Locked-media handling unchanged.

## 2026-08-17 — QUALITY SELECTOR + DURATION BADGES + CAPTURE PROTECTION

MOBILE (pushed): quality selector, duration badges, FLAG_SECURE protection.
- Player (MsVideoPlayer): new `qualities` prop (server-authoritative variants).
  Quality pill in the bottom bar (inline + fullscreen) opens a compact popup;
  selector only appears when the server offers >1 variant (today: single Auto).
  Switching quality swaps the engine source and resumes from the previous
  position (pendingResumeRef consumed by whichever player is active on load) —
  never restarts the video. Remembered preference stored in AsyncStorage
  (ms_quality_pref_v1); only applied when the server offers that variant.
  Disk-cache key is quality-aware (videoId__q_<label>) so variants don't collide.
- Duration badges: MsPostCard video thumbnails + album grid video items show
  m:ss / h:mm:ss from real server metadata (durationSecs) — never invented.
- Native capture protection: expo-screen-capture (Android FLAG_SECURE, real
  OS-level blocking) via lib/screen-protection.ts (ref-counted acquire/release
  + useScreenProtection hook). Active on: paid album screens while unlocked,
  subscriber-gated video detail (post.tier set). Released on unmount — never
  leaks to other screens. iOS: no supported OS API — documented limitation.
- Types: MediaQuality added to services/posts, content (Short), albums
  (AlbumItem). LongForm/Shorts players pass qualities through.

SERVER (committed locally, patch backed up): buildVideoRow/buildShortRow now
return `qualities` (single {label:'Auto', url, height} entry today — honest,
since no transcoding exists; [] when locked so no URL leaks). loadAlbum items
also carry qualities + duration_secs. Future transcoding (api.video) populates
more variants and the mobile selector lights up automatically.

## 2026-08-17 — CAPTURE PROTECTION LEAK FIX (pushed)

Reported: screenshot/screen-recording blocking active EVERYWHERE in the app.
Root cause: FLAG_SECURE is applied to the activity window (whole app) and the
original lib/screen-protection.ts had two leak vectors — (1) a failed
allowScreenCaptureAsync (the module throws MissingActivity mid-navigation)
left the flag set forever with no retry, and (2) protection stayed active
while a protected screen was covered by another pushed screen (expo-router
keeps the screen below mounted). Fixed by hardening the helper:
- All prevent/allow calls serialized on a promise chain; failed calls revert
  the state mirror so the next reconcile retries.
- AppState foreground + no active protected screen => force allowScreenCapture
  (clearFlags is a no-op when unset) — self-healing safety net.
- useScreenProtection is now focus-aware (useFocusEffect): protection releases
  the moment the protected screen blurs (push/back/tab), so it can never leak
  into unrelated screens. Fullscreen preview Modal keeps focus => stays covered.
No call-site changes needed; server untouched.

## 2026-08-17 — REGRESSION RECOVERY AUDIT (final targeted fixes, mobile PUSHED, server committed+patch)

Reported regressions and their root causes (all verified in code, both repos
`tsc --noEmit` clean):

1. **Video duration "13h 45m" for a 48s video** — root cause was UPLOAD, not
   the player: expo-image-picker reports `asset.duration` in MILLISECONDS but
   create-post/create-album stored it into `media.duration_seconds` raw, so the
   DB held 47735 "seconds". All mobile formatters (MsPostCard fmtDuration,
   profile, videos list, explore, album grid, chat formatDuration) are
   seconds-based and correct; the player timer reads engine `durationMillis`
   (ms) directly. Fixed by converting ms→s at upload. Legacy rows already in
   the DB are NOT fixed (needs a one-off Turso UPDATE if any remain).
2. **Seek tracker broken** — the old custom tracker was already REPLACED by the
   native `@react-native-community/slider` (commit 8529527) with drag-pinning
   (`dragging`/`dragMs` state pins the thumb while dragging; on release the
   seek lands and live ticks resume). Pink accent. No custom seek remains.
3. **Quality selector "missing"** — selector exists in MsVideoPlayer (pushed
   e5c968b) and shows only when the server offers >1 variant. Server exposes
   `qualities` (3c9b4fd) — a single honest Auto entry since no transcoding
   exists on Vercel+R2. Missing wiring: `app/content/[id].tsx` never passed
   `post.qualities` to the player — fixed (pushed c8751ae). videos/[id], shorts
   (MsShortsPlayer), album preview already passed it.
4. **Short pause crash (Android)** — root cause: `removeClippedSubviews` on the
   paged FlatList detaches the expo-av native Video view while the JS ref still
   targets it; pausing/playing a detached instance crashes. Fixed by setting
   `removeClippedSubviews={false}` (windowSize/maxToRenderPerBatch still cap
   mounted pages).
5. **Album creation "Creator account required"** — root cause: `POST /albums`
   gates on `auth.user.role`, but that came from the JWT claim, which is stale
   for users who became creators after login (15m access token). Fixed in
   `server/middleware/auth.ts` (server commit 892de7c, NOT pushed): both
   requireAuth/optionalAuth re-read the account's LIVE role from `users` on
   every request. `/user/me` already returns the DB role so the app's creator
   state was never the problem.
6. **Shorts onboarding not dismissing** — `handleOnboardingComplete` awaited
   AsyncStorage before closing; hardened to close the modal FIRST, then
   fire-and-forget the flag write (pushed c8751ae).

MOBILE PUSHED: c8751ae (4 files: content/[id], create-album, create-post,
shorts/index). SERVER COMMITTED LOCALLY: 892de7c (3 files: posts/[id]/route,
posts/route, middleware/auth) — push still 403 (credential scoped to
MeetSweet-mobile only). Patch backup at workspace root:
`0001-Authoritative-live-role-and-quality-wiring.patch`. The live Vercel app
still runs the OLD auth middleware, so the album-creator fix only takes effect
once this commit is pushed and redeployed.

Why the user saw regressions: the APK + live server predate several fixes
(quality wiring, live role, duration units). A fresh EAS build after these
pushes should match the codebase.

## 2026-08-17 — RANKING + SEARCH OVERHAUL (server committed locally, patch backed up)

CONTENT RANKING (replaces chronological ordering in ALL feeds):
- feedRankScore(userId) in lib/services/content.ts — pure-SQLite blended score:
  capped popularity (like/comment/save/share/view, 60-pt cap = log-like dampener
  so old viral content can't dominate), engagement rate (interactions per view,
  capped 100), freshness 1/(1+age_days)*5 (bounded new-content boost), 1.2
  subscription boost (personalization), deterministic per-(user,post) jitter
  [0,0.8] from posts.rowid+user-seed (exploration; pagination-stable per user).
  Validated live against Turso (rowid/julianday/min/max/EXISTS all OK) and a
  local scratch DB (dedup exclusion verified).
- Wired into: /explore (page-based), /posts/feed (home), /posts generic,
  /videos, /shorts/feed. Order: score DESC, published_at DESC, id DESC.
  Ranked cursors: score__published_at__id (legacy cursors still accepted).
- Creator diversity: applyCreatorDiversity() reorders each page (max 2
  consecutive / 50% share per creator, deterministic) — one creator can't
  monopolize a feed.
- Feed dedup: feed_impressions table (user_id, post_id, seen_at, unique pair)
  + recordFeedImpressions() on every feed response; getFeedDedupClause() excludes
  posts seen within 24h UNLESS owned or subscribed-to-creator. Resilient
  pre-migration: cached sqlite_master check (db.all) skips the clause when the
  table doesn't exist, so feeds never 500 before the migration runs.
- Engagement is authoritative (DB columns); views use the existing 60s/90%
  server view rule — opening a video can't inflate ranking.

SEARCH (/search rewritten, /users/search untouched):
- Relevance tiers: exact > prefix > substring on username/title/caption/
  display_name; creator+verified boosts for users; engagement (capped) +
  freshness for content. Includes posts/videos/shorts + a new albums section.
  Free/public only (no subscriber media leak), hidden/blocked creators +
  Not-Interested excluded, pagination, empty q => empty results (200).
- Indexes added via migrate.ts: users.username, users.full_name, posts.title,
  posts.caption, albums.title (prefix LIKE can use them).

MIGRATION REQUIRED: npx tsx scripts/migrate.ts (feed_impressions + indexes).
Feeds keep working pre-migration (dedup guarded), ranking works regardless.

MOBILE: no code changes needed — feeds already consume server order (no
client-side .sort anywhere). NOTE: Explore's in-page search field is still a
client-side filter over the loaded catalog page (not the whole DB); the
server /search endpoint is production-ready for a dedicated search screen.
APK: eas.json has a preview APK profile but the project isn't linked to EAS
(no extra.eas.projectId) and eas-cli is not logged in here — build must run
from the user's machine after `eas login` + `eas init`.

## 2026-08-17 — CROSS-REPO REGRESSION INVESTIGATION (seek / quality / thumbnails / creator flow)

UNCOMMITTED in both trees (mobile 10 files, server 2 files on top of 1 new commit).

SERVER (Meetsweet/):
- RE-APPLIED the lost commit as `c20311a` ("Authoritative live role in auth; expose
  qualities on post detail and feed rows") via `git am` of
  `0001-Authoritative-live-role-and-quality-wiring.patch` — the workspace reset had
  dropped 892de7c entirely. middleware/auth.ts now re-reads the account's LIVE role
  from `users` every request (requireAuth + optionalAuth), so a user who becomes a
  creator is authorized immediately; POST /albums "Creator account required" is fixed.
  LIVE Vercel still runs the OLD middleware — push required before it takes effect.
- NEW (working tree, not committed): consistent creator gates — POST /posts rejects
  short/video creation for non-creators (plain text/image posts stay open) and
  POST /videos rejects non-creators, both with 403 CREATOR_REQUIRED mirroring albums.
- Verified (no change needed): media upload route (multipart File validation, R2
  PutObject + immutable CacheControl, media insert, {id,url,media_type} aliases),
  media PATCH (thumbnail/width/height/duration_seconds, uploader-owned),
  buildVideoRow/buildShortRow (width/height/qualities/duration), loadAlbum (items
  carry qualities + dims; locked URLs nulled), shorts feed (video-media-only),
  /creator/become (role flip + creator_settings default ₦200).

MOBILE (MeetSweet-mobile/MeetSweet-mobile):
- MsVideoPlayer SEEK real-bug fixes (native Slider was already in place): (1) jerking
  seeks clamped against an UNSEEDED duration ref — fullscreen `fsDurationRef` stayed 0
  until the fs engine's first loaded tick, so an early drag clamped to 0 and playback
  "jumped back to the beginning"; seekTo/fsSeekTo now fall back to duration state
  (`d = ref > 0 ? ref : durationMs`), and openFullscreen seeds fs refs from the inline
  player. (2) source-resolution effect re-ran on every `active` flip and swapped the
  engine source remote→cached-file once a background download finished (expo-av
  restarts from 0 on ANY source change) — guarded with lastResolvedUriRef. No custom
  seek; platform Slider stays. Web "worked" because HTML5 video seeds duration at
  metadata load, narrowing the unseeded window.
- Quality selector: verified wiring everywhere (content/[id], videos/[id],
  MsShortsPlayer, album preview, chat attachments, MsPremiumContent); server offers a
  single honest Auto (no transcode infra — see limitation below); posts/[id]+feed now
  carry `qualities` via c20311a. Selector intentionally hidden with ≤1 variant.
- Become-a-Creator flow was DEAD: screen registered but primary button had NO onPress
  and NO screen linked to it. Now: button posts /creator/become → refreshUser() → back
  (409 = already creator → refresh+back); entry points: Profile tab CTA card
  (non-creators only, server-driven), Settings dashboard row (non-creator →
  become-creator), Create sheet gates album/video/shorts for non-creators,
  create-album renders a "Creators only" gate, create-post type-select routes
  video/shorts/album taps. Server remains the authority (gates in routes), UI just
  routes users to the flow instead of dead-end 403s.
- Thumbnail ratio: videos list card (app/videos/index.tsx) was FIXED 16:9 regardless
  of media → now uses real width/height (LongFormVideo + videoFrom carry them) with
  16:9 fallback. Feed/explore cards already used natural ratio. Legacy media rows with
  NULL width/height still fall back to 16:9 (data issue).
- Short upload + album multi-media: verified end-to-end in code, no changes needed
  (File-based FormData fix is in services/media.ts; server validates album media
  ownership and fails loudly on missing items).

VERIFIED LIVE (read-only): https://meetsweet.space/api/videos returns width/height,
qualities([Auto]), correct duration_secs (47.735 for a ~48s video — ms→s fix is in
effect); api/health OK.
LIVE E2E RUN (throwaway account, 2026-08-17, 13/13 checks passed): register -> verify
(code read from Turso) -> login -> /users/me role=user -> /creator/become -> /users/me
role=creator -> POST /albums returned 403 CREATOR_REQUIRED (PROVES the deployed server
still reads the stale JWT role; fixed by c20311a, needs deploy) -> POST /posts short
400 MEDIA_REQUIRED (route validates) -> plain post 201 + roundtrip -> DELETE /users/me
cleanup -> deleted account rejected on re-login. Media upload + album purchase not
tested live (R2 keys + Paystack top-up not available in-session).

Limitations: no transcoding pipeline (Vercel serverless + R2, no ffmpeg), so quality
selecting only ever offers the single original variant; user asked for Mux/Cloudflare
Stream if real multi-quality is wanted. AGENT_MEMORY update: push for the server repo
is still credential-blocked (scope MetSweet-mobile only); back up any server commits
as patches at workspace root like prior sessions.

## Final cleanup pass (2026-08-17, second session)

- **Styled notifications**: added `components/MsGlobalDialogs.tsx` (global `dialogs.confirm/alert/options` host mounted in `app/_layout.tsx`) and `components/MsCreatorGateSheet.tsx` (styled bottom modal: "Creator access required" → Become a Creator → server call → refreshUser → continue). Converted the app's ~77 `Alert.alert` call sites (posts, comments, creator page/dashboard, chat, albums, attachments, settings) to the shared styled system. Only remaining `Alert.alert` is the styled `MsConfirmDialog`'s own OS fallback — no default/unstyled popups left.
- **Creator authz consistency (server)**: `POST /api/shorts` was an ungated duplicate creation route (mobile actually creates shorts via `POST /posts`). Added the same live-role gate → commit `dfa20b3`. Backup patch refreshed at workspace root (`0001-Live-role-auth-and-creator-gates.patch`, now 2 commits / 116 lines).
- **Settings dedup**: removed the dead "Message Permissions" row from Settings → Privacy. `user_settings.message_perm`/`allow_dms` were written but NEVER read; the only enforced messaging gate is `creator_settings.who_can_message` (creator dashboard) via `lib/services/chat-rooms.ts`. One authoritative location remains. No Advertising setting exists.
- **Settings persistence**: content prefs now load server-first; AsyncStorage only used as offline fallback when the server call fails (was overwriting server values on every load — stale local state could win).
- Server `/settings/*`, `/settings/privacy`, `/settings/notifications` are the single source of truth; `/users/me/*` are thin aliases to them.
- Both repos pass `tsc --noEmit`. Server is 3 commits ahead of origin (c20311a, f866c01, dfa20b3); mobile is 3 ahead (a83f43a, 342bf9e, ea58cb1). Still need user push + Vercel redeploy for the live-role fix to take effect in production.

## Targeted final pass (2026-08-18) — deployed, E2E'd, Expo Go live

- **Push + deploy COMPLETE**: user provided GitHub PAT + Expo token in-session
  (used inline only, never committed). Pushed server main → `dfa20b3` (3 commits:
  c20311a live-role auth + qualities, f866c01 /posts creator gate, dfa20b3 /shorts
  gate) and mobile main → `3e454cb` (seek session-guard fix). Vercel auto-deployed
  on push — **live-role fix is now LIVE in production**.
- **Live E2E vs meetsweet.space: 15/15 PASS** (throwaway account, cleaned up):
  register → verify (code read from Turso) → login → role=user → non-creator
  short → 403 CREATOR_REQUIRED (new gate confirmed live) → become creator →
  role=creator → **album POST 201** (no more "Creator account required") → short
  as creator 400 MEDIA_REQUIRED (no 403) → full short with media_ids 201 →
  DB record published + media attached → DELETE /users/me cleanup.
- **DB fix applied**: devatron's users.role/is_creator had reverted to
  'user'/0 (the earlier one-off UPDATE was lost). Restored
  role='creator', is_creator=1, is_active=1 (he already had creator_settings
  ₦2480 + owns the only published posts). No other DB structures touched.
- **Video seek**: the tracker was already the platform-native Slider (pink);
  found the real remaining "jump back to beginning" cause — the source-
  resolution effect re-ran on every `active` flip and swapped remote→cached
  file once a background download finished, and expo-av restarts from 0 on any
  source change. Fixed with a per-(videoId,url) session guard (`lastResolved-
  SessionRef`); cache adopted next session. Double-tap seek also guarded
  against unseeded duration (no clamp-to-0). Commit 3e454cb. `fmtTime` verified
  correct (no ms). Quality selector confirmed wired in the ACTIVE player
  (MsLongFormPlayer → MsVideoPlayer, both inline + fullscreen), server emits
  qualities; single "Auto" variant hides the pill honestly (no fake options).
- **Expo Go running**: `expo start --tunnel` (setsid/nohup) on port 8081.
  VERIFIED URL: `exp://b7ik87q-prcon-8081.exp.direct` — manifest 200 via
  tunnel, launchAsset bundle 200 (28MB Hermes, no resolve errors). Note: the
  tunnel URL dies with the workspace; restart with the same setsid command if
  it goes stale.

## Final media/player pass (2026-08-18, commit 0862810, pushed)

- **Long-form video now uses platform NATIVE controls** (expo-av `useNativeControls`
  true) for seek/play/time — inline AND fullscreen. Custom seek bar (Slider),
  gesture layer, centre play/pause, double-tap seek flashes REMOVED for standard
  mode. Floating chrome kept always-visible: quality pill (top-right, only when
  server offers >1 variant), fullscreen button, fill-close. **Shorts untouched**
  (`useNativeControls={!isShorts}`; all shorts code paths identical).
- **Album cards**: server already returned item width/height; client was dropping
  them. Now surfaced (services/albums.ts AlbumItem.width/height) and used by
  dedicated `AlbumImageCard` (real ratio, square fallback) + `AlbumVideoCard`
  (real ratio, 16:9 fallback, play badge, real duration) with rounded corners.
  Tap → fullscreen preview: image contain / standalone MsVideoPlayer (no post UI).
- **Profile tabs**: Videos thumbnails now follow the video's real aspect ratio
  (16:9 fallback); Shorts fallback icon = FilmStrip. Navigation: video →
  /videos/:id, short → /shorts?startId= (unchanged).
- **Fresh-account live E2E 13/13 PASS**: register → become creator AUTO-SEEDS
  users.role=creator + is_creator=1 + creator_settings (₦200) → /users/me
  reflects immediately → album 201 → short 201 → cleanup. No manual DB fixes.
- Expo tunnel still live at `exp://b7ik87q-prcon-8081.exp.direct`; bundle
  rebuilds with the new player code (HTTP 200, no resolve errors).

## 2026-08-20 — MEDIA UPLOAD 413 FIX: direct-to-R2 sessions (pushed)

**Root cause of the HTTP 413:** the mobile `services/media.ts` POSTed the whole
file as `multipart/form-data` to `/api/upload` (alias of `/api/media/upload`),
and that route did `req.formData()` → `file.arrayBuffer()`, buffering the entire
video in the **Vercel serverless request body**. Vercel's body limit rejects
files above a few MB with 413 Payload Too Large before the handler runs.

**Fix (both repos, pushed):**

- **Server (`Volttaik/Meetsweet`, commit `3036775`)** — new
  `server/lib/services/uploads.ts` + `server/app/api/uploads/*` routes
  (`POST /api/uploads`, `GET/DELETE /api/uploads/:id`,
  `POST /api/uploads/:id/complete`, `POST /api/uploads/:id/parts/:partNumber`).
  Small files → single presigned R2 PUT; files > 20 MiB → S3/R2 multipart
  (10 MiB parts, per-part presigned URLs, server-side CompleteMultipartUpload).
  The media row is created only after the bytes are confirmed in R2. New
  `upload_sessions` table (pending/uploading/completed/failed/cancelled) in
  `schema.ts` + idempotent `scripts/migrate.ts` entry; abandoned multipart
  uploads swept by `scripts/cleanup-uploads.ts`. Legacy `/api/upload` now
  returns 410 and `server/app/api/media/upload/route.ts` was deleted.
- **Mobile (`Volttaik/MeetSweet-mobile`, commit `9965863`)** —
  `services/media.ts` rewritten to: `POST /api/uploads` → direct PUT to R2
  (single or multipart with per-part ETag tracking + retry + URL re-issue) →
  `POST /api/uploads/:id/complete`. `uploadMedia()` signature and return shape
  (`{ id, url, media_type }`) unchanged, so posts/shorts/albums/chat/avatar
  callers migrate untouched. R2 access/secret keys never reach the client.

**MIGRATION REQUIRED on the live DB:** `cd server && pnpm migrate` (creates
`upload_sessions`). **Deploy:** push server main (Vercel auto-deploys) and
rebuild the mobile APK.

**Video player untouched** — no changes to MsVideoPlayer / react-native-video /
Expo Video / seek / play-pause / sync / controls / fullscreen.

NOTE: mobile typecheck could not run in this session (Expo `node_modules` were
not installed); server `tsc --noEmit` passes. A device E2E of the
1/3/4/5/10/25 MB+ matrix is still outstanding and needs the deployed server +
`R2_PUBLIC_BASE_URL` set.

**UNIFIED REALTIME (WebSocket) — implemented:** the app now has a unified
WebSocket realtime layer. Client: `services/realtime.ts` (singleton; auth via
`?token=`, reconnect with backoff, heartbeat, idempotent event dedup, missed-
event recovery via outbox `sync`). Wired: chat (messages/typing/recording/
read/reactions/presence), comments (`useComments`), post like counts, the
notifications badge + wallet refresh, and own-profile subscriber counts. All
existing polls remain as FALLBACKS and are skipped while the socket is open.
Full protocol + server side documented in `Meetsweet/.agent/REALTIME.md`.
Deploy note: WebSockets need Fluid compute (already in `vercel.json`).

**REALTIME UPDATE:** cross-instance fan-out now uses a Redis Streams bus
(`Meetsweet/server/lib/realtime/bus.ts`, XREAD BLOCK per the Vercel chat
guide) that activates only when `REDIS_URL` is set — single-instance fallback
otherwise. Chat message EDIT/DELETE are now realtime (`chat.message.updated`/
`chat.message.deleted`); the server endpoints for them (previously missing,
mobile calls were 404ing) now exist. Client subscriptions are batched and sent
after `hello`; typing relays throttled server-side.

**REDIS CONFIGURED (2026-08-22):** the bus accepts either `REDIS_URL`
(wire-protocol `rediss://...`) or the Upstash REST pair
(`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) — the wire URL is
derived automatically (`bus.ts` `resolveRedisUrl()`). Live Upstash instance
verified (PING/XADD/XREAD BLOCK OK); values stored in the server's local
`.env` (gitignored) and in Vercel env vars. The `meetsweet:events` stream is
capped at ~500 entries (MAXLEN trim) — Redis usage stays well under 1 MB.
Server + mobile realtime work is pushed to both repos (see git log).
