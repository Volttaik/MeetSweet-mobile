# MeetSweet — Backend Issue Report

Audited from the mobile client (MeetSweet-mobile) against the server
(`Volttaik/Meetsweet`, Next.js + Drizzle + Turso + R2). Last updated: 2026-08-20.

Legend:
- **MOBILE FIXED** — issue resolved on the client in this pass.
- **BACKEND ISSUE** — root cause is server/API/database; needs a server fix.
- **VERIFIED OK** — checked end-to-end; behaves as intended.

---

## 0. MEDIA UPLOAD — HTTP 413 Payload Too Large (FIXED, 2026-08-20)

- **Problem:** mobile `services/media.ts` POSTed the entire file as
  `multipart/form-data` to `/api/upload` (alias of `/api/media/upload`). That
  route buffered the whole file in the Vercel serverless request body
  (`req.formData()` → `file.arrayBuffer()`), so any file above Vercel's body
  limit failed with **413 Payload Too Large**.
- **Fix:** replaced with a direct-to-storage flow. Server
  (`Volttaik/Meetsweet` commit `3036775`) adds `server/lib/services/uploads.ts`
  + `server/app/api/uploads/*` and an `upload_sessions` table; it issues a
  presigned R2 PUT (small files) or an S3/R2 multipart upload with per-part
  presigned URLs (files > 20 MiB), and creates the media row only after the
  bytes are confirmed in R2. Mobile (`Volttaik/MeetSweet-mobile` commit
  `9965863`) rewrites `services/media.ts` to authorize → PUT directly to R2 →
  complete, with per-part ETag tracking + retry. No media bytes cross the
  Vercel request body. Legacy `/api/upload` returns 410;
  `server/app/api/media/upload/route.ts` deleted.
- **Deploy note:** run `cd server && pnpm migrate` (creates `upload_sessions`),
  push server main (Vercel auto-deploys), rebuild the mobile APK.

---

## 1. ALBUMS — creation / ownership / purchase / unlock / access

### 1a. Album creation accepts the mobile price field
- **Endpoint:** `POST /api/albums`
- **Problem:** Mobile sends `unlock_price` (translated from the creator's price
  input). Older live server versions only accepted `price_credits` and fell
  through to `0` (a free album) when neither was present.
- **Expected:** Any price field the client sends is accepted; albums are
  purchase-only (no Free/Subscriber/Subscriber+ tiers).
- **Actual / status:** Server-side fix already written and committed locally
  (`03851d7` — `POST /albums` accepts `unlock_price`/`price`/`price_credits`,
  never falls through to free). **NOT YET DEPLOYED** — see §4.
- **Mobile requires:** nothing further; the client already sends the price and
  hides tier selection in the create flow.

### 1b. Album access — owner / purchaser / locked
- **Endpoint:** `GET /api/albums/:id` (+ `loadAlbum` service)
- **Expected:** Owner → `unlocked`, contents visible, no Purchase button.
  Purchaser → `unlocked`. Non-purchaser → locked, contents NOT exposed
  (locked item URLs nulled), purchase sheet shown instead.
- **Actual / status:** **VERIFIED OK** in code — `loadAlbum` marks
  `unlocked` for owner / free / purchasers and nulls URLs for locked items;
  the client (`app/album/[id].tsx`) gates on `requiresPurchase &&
  !isUnlockedByMe` and only renders contents when unlocked.
  `app/album/[id].tsx` shows the styled purchase sheet for locked albums.
- **Mobile requires:** the server must keep returning `isUnlockedByMe` from
  LIVE data (ownership + `album_unlocks`), not client-supplied flags.

### 1c. Album purchase integrity
- **Endpoint:** `POST /api/albums/:id/unlock`
- **Expected:** Purchase succeeds ONLY when the atomic transaction commits
  (wallet debit + creator credit + `transactions` rows + `album_unlocks`
  insert). Insufficient balance → error + rollback. Owner / free /
  already-purchased → short-circuit with `already_unlocked: true`, never
  charged. Never show "Purchase successful" unless the server confirms.
- **Actual / status:** **VERIFIED OK** in code — the route is atomic, returns
  402 `INSUFFICIENT_BALANCE` on low balance, and the client only shows
  "Album unlocked" after `res.purchased === true`; owner/prior purchases show
  an "Already unlocked" info modal instead of a false success.
- **Mobile requires:** server must return `{ purchased, already_unlocked }`
  and error `code: 'INSUFFICIENT_BALANCE'` with 402 on failure.

### 1d. "Missing `file` field" when creating an album
- **Where:** album cover upload form data.
- **Status:** **MOBILE FIXED (web-only)** — confirmed during an earlier pass
  that this error was web-specific and not reproducible on the native client;
  the native media-upload path persists. If it reappears on device, it is a
  server `media/upload` multipart parsing issue — capture the request body
  shape from Expo's `FormData` (`uri`, `name`, `type`) and compare with the
  server's `request.formData()` expectation.

---

## 2. MESSAGING — account isolation & state persistence

### 2a. Account A's conversations leaking into Account B
- **Flow:** logout → login as a different account.
- **Expected:** Account B must never see Account A's chat list / messages.
- **Actual / status:** **MOBILE FIXED** — `clearChatCache()` (rooms,
  messages, drafts, room contexts) runs on logout, on session-expiry, and on
  every fresh login in `contexts/AuthContext.tsx`. Room contexts were already
  keyed per `(chatRoomId, userId)`. The local block flag was additionally
  keyed by the OTHER user's username only — **fixed in this pass** to
  `@ms_blocked_<currentUserId>_<username>` so a block is per-account.
- **Mobile requires:** server `/api/messages/rooms` and `/api/messages/rooms/:id`
  must filter strictly by the authenticated user's context (never return
  another account's rooms). Client-side clearing is defense-in-depth, not the
  source of truth.

### 2b. Messaging state persistence (per current account)
- **Expected:** Reopening the app should not flash/rebuild the chat list;
  persistence must be scoped to the authenticated user.
- **Actual / status:** **VERIFIED OK** — chat list + messages cache in SQLite
  keyed by room, cleared on account switch; drafts keyed by room and cleared on
  switch. Message/media caches are the explicitly permitted local cache.
- **Mobile requires:** no server change.

---

## 3. SETTINGS — persistence

### 3a. Privacy / notification / app settings persistence
- **Endpoints:** `GET/PATCH /api/users/me/privacy`, `GET/PATCH
  /api/users/me/notifications`, `GET/PATCH /api/users/me/settings`
  (aliases into `/api/settings/*`).
- **Expected:** Toggling a setting persists to the account and is restored on
  re-open / after logout-login.
- **Actual / status:** **VERIFIED OK** — all three routes read/write the
  per-user `user_settings` row (auto-created on first GET). The mobile screen
  loads from these endpoints on mount and falls back to **user-scoped**
  AsyncStorage keys (`@ms_privacy_prefs_<userId>` etc.) only when the server
  is unreachable. Vibration/haptics is a device-level preference persisted on
  the device (`@ms_haptics_enabled`) — **added in this pass**, including the
  one-time enable/disable prompt on first haptic.
- **Mobile requires:** server must keep returning the exact field names the
  client normalizes (`private_account`, `notif_messages`, `push_notifications`,
  `autoplay_media`, `data_saver`, `high_quality_media`, `sensitive_content`,
  `language`, …). All currently match.

### 3b. Known server-side gaps (mobile already handles gracefully)
- `PATCH /api/users/me` ignores `email` — mobile detects the no-op and shows
  "Email change is not available yet" instead of a false success.
- `POST /api/auth/change-password` — if it 404s/405s, the mobile Settings flow
  surfaces "requires backend implementation". Needs a real implementation if
  password changes are required.
- Block/unblock (`POST /api/users/:username/block`) exists; the client mirrors
  block state locally per-account for the chat banner. Server remains the
  source of truth for actual messaging permissions.

---

## 4. DEPLOYMENT BLOCKER (must be resolved by whoever owns the server repo)

The following server-side fixes are **committed locally but NOT pushed to
`Volttaik/Meetsweet`**, so the live Vercel deployment does not have them yet:

| Commit | Change | Live impact if missing |
|---|---|---|
| `03851d7` | Creator pricing authoritative (`resolveBasePrice`, default ₦200, album `price` alias, backfill) | Subscription price can still display as ₦0/"Free" on live; album `price` field can 400 |
| `ef1f983` | `GET /api/creators` returns `subscribed_to_creator` + `subscription_tier` per viewer; media uploads get immutable CacheControl | Explore can still show a stale "Subscribe" button after refresh; slower repeat video plays |

The mobile client reads `subscribed_to_creator` / `subscription_tier` and
`isUnlockedByMe` from these responses — without the deployment, the client
falls back to local state, which is exactly the staleness this task eliminated.

**Action required:** push both commits to `Volttaik/Meetsweet` main (Vercel
auto-deploys). Backups of both commits exist as patch files in the
MeetSweet-mobile repo root (`0001-Make-creator-pricing-...patch`,
`0001-Catalog-...patch`).

---

## 5. What the mobile client requires from the server (summary contract)

1. `GET /api/creators` and `GET /api/creators/:id` → per-viewer
   `subscribed_to_creator`, `subscription_tier`, and price fields, resolved
   from live subscription rows (never client-supplied).
2. `GET /api/albums/:id` → `isUnlockedByMe` from ownership + `album_unlocks`;
   locked item URLs nulled.
3. `POST /api/albums/:id/unlock` → atomic; 402 `INSUFFICIENT_BALANCE` on low
   balance; `{ purchased, already_unlocked }` on success.
4. Messaging endpoints scoped strictly to the authenticated user's context.
5. Settings endpoints persist per-user and return the field names in §3a.
