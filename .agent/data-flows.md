# MeetSweet Mobile — Data Flows

End-to-end flows for the features that matter. Each was verified live
(real Expo web build + real server through headless Chromium, 2026-08-21).
Paths are relative to `MeetSweet-mobile/` (the app dir).

## 1. Authentication lifecycle

```
Login/Register
  → POST /api/auth/login|register (services/security.ts)
  → 2FA accounts: short-lived challenge token → app/two-factor.tsx
      → POST /api/auth/2fa/verify (email code) → real tokens
  → access token (memory) + refresh token (expo-secure-store) stored by AuthContext
  → navigate to (tabs)

Every API call (services/api.ts)
  → Authorization: Bearer <access>
  → 401 → single-flight POST /api/auth/refresh (rotates refresh token)
      → retry original request once
  → refresh fails (expired/revoked) → clear session → redirect to Login

Logout (settings → Log Out → MsConfirmDialog)
  → POST /api/auth/logout (revoke server-side)
  → clear tokens, chat caches, per-account prefs
  → redirect to Welcome/Login; authenticated screens unreachable via history/URL

Boot (app/index.tsx)
  → refresh token present → try refresh → tabs
  → none/invalid → Welcome
```

Guarantees (verified):
- Closing/reopening the app preserves the session (refresh token rotates).
- Expired access + valid refresh heals transparently; fully-invalid session
  returns to Login.
- Logged-out users can never land on a tab / settings / wallet /
  notifications screen (layout + screen guards redirect to Login) — no
  placeholder "U" profile state.

## 2. Wallet + header balance sync

```
Wallet screen or purchase action
  → server mutation (fund via Paystack / subscribe / album unlock)
  → response includes authoritative balance
  → WalletContext.setState(balance)
  → wallet screen + Home header MsWalletBadge re-render immediately
```

Verified: funding a wallet server-side updates the wallet screen **and** the
Home header badge instantly — no app restart, no stale balance. The badge
compacts large amounts (`₦4,500` → `₦5K`) — don't "fix" formatting checks
without knowing this.

## 3. Real-time state sync (poll-based, no sockets)

| Mutation | UI effect | Mechanism |
|---|---|---|
| Like (post/short/video/comment) | count/state updates instantly | `PostActionsContext` optimistic + server-authoritative response |
| Comment (pinned `MsComposer` on content detail) | comment appears instantly, count updates | submit → response → local list prepend |
| Subscribe | button state flips on response | `services/creators.ts` → response state |
| Album unlock | content revealed immediately | `POST /albums/:id/unlock` response |
| Message send | message appears instantly | `room-service.ts` → optimistic append |
| Incoming messages/comments | polling `…/changes` endpoints | `room-service.ts` / `comment-room-service.ts` |

Rule: mutations return authoritative state and the UI applies it — never
require an app restart or manual refresh. If state looks stale, check for a
second local cache (chat-cache, posts-db) not being invalidated, not the
server.

## 4. Sharing / deep links

```
User taps Share (MsShareSheet)
  → POST /api/share/create → token
  → link: https://meetsweet.space/s/<token> or meetsweet://s/<token>

Recipient opens link
  → app/s/[token].tsx → lib/deep-link.ts → POST /api/share/resolve/:token
  → { type: post|album|creator, id }
  → navigate directly to post/[id] | album/[id] | creator/[id]
```

Verified behavior: exact destination opens with **no** onboarding flash, no
creator-onboarding flash, no home-feed flash, no visible redirect — for app
closed, running, backgrounded, logged-in and logged-out. Logged-out users are
sent to Login and returned to the destination after authenticating.

## 5. Media upload (direct-to-R2)

```
services/media.ts
  → POST /api/uploads                        (auth) → upload_sessions + presigned URLs
  → PUT <presigned R2 URL>  (small)   OR   POST /api/uploads/:id/parts/:n (multipart, >20 MiB)
  → POST /api/uploads/:id/complete           → media row
  → media id attached to post / short / album item
```

Why: legacy `POST /api/upload` buffered the whole file in the serverless
request body → **413 Payload Too Large**. No media bytes cross the API body
now. Legacy route returns 410. Errors to watch: 403 (bad presign/expiry),
413 (should never happen — if it does, bytes are still going through a route
handler), broken URLs (R2_PUBLIC_BASE_URL misconfigured), missing thumbnails
(thumbnail generation step), wrong duration (metadata from ffprobe).

## 6. Video playback (react-native-video, single player)

- `MsVideoPlayer` is the only video player: posts, shorts, albums, DMs,
  previews all route through it.
- Source URL comes from the server media row and **stays stable** — the local
  `video-cache` stores bytes for offline replay but never substitutes a local
  URL for the playing source.
- Verified: play, pause, seek (lands at the target time — playback continues
  from there, it does **not** restart from 0:00), current-time progression,
  correct duration, full-screen, native controls, live-source loading.
- The historical "seek restarts from 0:00" bug is fixed; verify with actual
  playback position, not just the seek bar.

## 7. Screen protection (capture prevention)

```
lib/screen-protection.ts            → expo-screen-capture (JS guard)
plugins/withSecureWindow.js         → FLAG_SECURE native flag (Android)
modal theme override                → protection stays active over modals
```

Requirement: **no part of MeetSweet is capturable** via normal screenshots or
screen recording where the platform permits prevention. Wired globally (root
layout), including modals, full-screen media, and across background/foreground
on supported platforms. iOS has no FLAG_SECURE equivalent — that's a platform
limit, not a gap.

## 8. Forgot password (4-step)

```
app/forgot-password.tsx
  1. enter email → POST /api/auth/forgot-password (email with 6-digit code, 15 min expiry)
  2. enter code (OTPInput) → POST /api/auth/reset-password (verifies code)
  3. set new password (validation, show/hide)
  4. done → success → login with new password
```

Verified end-to-end including logging in with the new password. The reset
button on step 3 is the form's primary button — screen titles ("Reset
Password") are not buttons.

## 9. Notifications

`app/notifications.tsx` loads `GET /api/notifications`. Rows carry type +
context: likes, comments, subscriptions, messages, new posts. Read state via
`POST /api/notifications/:id/read` and `/read-all`. Verified all five types
render with correct context and the feed updates.

## 10. Albums (creator → purchase → display)

```
Creator: create-album.tsx (price via POST /api/albums unlock_price) → creator profile shows album
Viewer:  creator/[id] → album/[id]
  locked  → purchase CTA (cursor:pointer) → confirm sheet ("Purchase · ₦500") → POST /api/albums/:id/unlock
  → server confirms { purchased } → content revealed; wallet debited; header balance updates
Non-creators can't reach creator-only flows (server + UI gating).
Album + items persist server-side; data survives app restarts.
```

Verified end-to-end in the browser (two clicks: CTA, then the confirmation
sheet button).
