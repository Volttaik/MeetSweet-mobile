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
