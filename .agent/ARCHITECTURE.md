# MeetSweet Mobile — Architecture

How the app is built and how its parts interact. Paths below are relative to
`MeetSweet-mobile/` (the Expo app directory inside this repo).

## Stack

- **Expo SDK 54 / React Native 0.81.5**, **expo-router ~6.0.24** (file-based
  routing), TypeScript strict.
- **Tailwind via uniwind** for styling (class strings like `"bg-surface"`),
  `heroui-native` + `lucide-react-native`/`phosphor-react-native` icons.
- **react-native-video 6.19.2** — the single unified video player
  (`MsVideoPlayer.tsx`) for posts, shorts, albums, DMs, previews.
- **@tanstack/react-query** for server state; **expo-sqlite** for chat/video
  caches; **AsyncStorage** for prefs; **expo-secure-store** for the refresh
  token; **expo-screen-capture** + a config plugin for screen protection;
  **expo-notifications** for push; **expo-local-authentication** for biometric
  lock.

## Layering

```
app/ (screens, expo-router)
   │  read state from / dispatch to
   ▼
contexts/  (Auth, Wallet, PostActions, Notifications, BiometricLock)
   │  call typed clients
   ▼
services/*.ts  →  services/api.ts (fetch wrapper: base URL, Bearer, 401→refresh→retry)
   │
   ▼
backend (sibling repo Meetsweet — Next.js API at EXPO_PUBLIC_API_URL)
```

`components/` are presentational + interactive building blocks (all prefixed
`Ms`), consumed by screens; several are app-wide (`MsGlobalDialogs`,
`MsToast`, `MsNetworkBanner`, `MsOfflineBanner`). `lib/` holds infra:
deep-link resolution, screen protection, SQLite caches, haptics, biometric.

## Screens (expo-router routes in `app/`)

| Route | Purpose | Auth gate |
|---|---|---|
| `index` | Boot: valid session → tabs; else Welcome | — |
| `welcome`, `get-started`, `onboarding`, `new-user-welcome`, `profile-setup`, `complete-registration` | Onboarding funnel | no (redirect to tabs when authed) |
| `auth`, `login`(via auth), `register`, `create-account`, `create-password`, `verify-email`, `verification`, `two-factor`, `forgot-password`, `success` | Auth sub-screens (OTP boxes, 4-step reset, 2FA challenge) | no |
| `(tabs)/index` | Home feed (posts, shorts, albums, wallet badge in header) | **yes** (tab layout guard) |
| `(tabs)/explore` | Discovery / search | **yes** |
| `(tabs)/messages` | DM room list | **yes** |
| `(tabs)/profile` | Own profile | **yes** |
| `content/[id]` | Unified post/album detail with pinned composer (modern path) | yes (content-level) |
| `post/[id]` | Legacy post detail (share links resolve here; comments in a modal sheet) | yes |
| `videos/[id]`, `shorts/index`, `shorts` | Video/shorts players | yes |
| `album/[id]`, `purchased-albums`, `create-album` | Album detail (purchase sheet), purchased list, creator creation | yes |
| `creator/[id]` | Creator profile (gated content, subscribe, albums) | yes |
| `chat-room/[chatRoomId]` | DM thread | yes |
| `create-post`, `edit-post/[id]`, `post-media` | Post/media creation | yes |
| `become-creator`, `creator-dashboard`, `creator-payout` | Creator flows | yes |
| `notifications`, `settings`, `wallet` | Push screens | **yes** (added guards) |
| `s/[token]` | Share-token resolver → deep-links to the exact destination | no (works logged-out; redirects to Login after auth returns to destination) |

**Auth gating:** the tabs layout (`app/(tabs)/_layout.tsx`) redirects a
logged-out user to Welcome/Login — screens can never render logged-out
placeholders. `settings`, `wallet`, `notifications` (and any authenticated
push screen) have the same guard. `s/[token]` is intentionally accessible
logged-out so shared links resolve after login.

## Contexts (cross-screen state)

- **AuthContext** — access token (memory) + refresh token (SecureStore);
  login/register/logout; **401 interception**: any API 401 triggers a refresh
  attempt (single-flight); expired+unrefreshable → clear session → redirect to
  Login. Logout clears tokens, chat caches, per-account prefs.
- **WalletContext** — wallet balance shared by the wallet screen and the Home
  header badge (`MsWalletBadge`, compacts ₦4,500 → "₦5K"). Balance updates
  from server responses propagate to every consumer immediately (no restart).
- **PostActionsContext** — optimistic like/comment/subscribe with
  server-authoritative reconciliation.
- **NotificationsContext** — notification feed state + unread handling.
- **BiometricLockContext** — optional biometric app lock (`expo-local-authentication`).

## Services (typed API clients, one file per domain)

`api.ts` (core), `auth`-adjacent (`security.ts`), `posts.ts`, `content.ts`,
`albums.ts`, `shorts` (via content), `creators.ts`, `creator.ts`, `explore.ts`,
`subscriptions.ts`, `wallet.ts`, `notifications.ts`, `settings.ts`,
`chat` (`room-service.ts`, `comment-room-service.ts`, `chat-cache.ts`,
`chat-media.ts`), `media.ts` (direct-to-R2 upload), `sharing.ts`, `users.ts`,
`categories.ts`, `onboarding.ts`, plus offline/cache layers (`video-cache.ts`,
`posts-db.ts`).

`services/api.ts`:
- Base URL from `EXPO_PUBLIC_API_URL`; attaches `Authorization: Bearer <access>`.
- On 401: single-flight refresh via `POST /api/auth/refresh` → retry once.
- On refresh failure: clears session → redirects to Login (never a broken
  half-authenticated state).

## Key components

- `MsVideoPlayer` — the one video player (react-native-video): play/pause/
  seek/fullscreen/native controls; stable source URL (no local-cache swap of
  the playing URL).
- `MsComposer` — multiline composer; **Enter does not send** — the send button
  does (used by content detail + chat).
- `MsCommentsSheet` (`useComments`, `CommentsModal`, `CommentRow`) — comment rooms (realtime via SweetSocket).
- `MsPostCard`, `MsFeedVideoCard`, `MsImageCard`, `MsAlbumCard`,
  `MsCreatorCard` — feed cards.
- `OTPInput` — 6-box code entry (verify-email, 2FA, forgot-password).
- `MsWalletBadge` — header balance (compact ₦ formatting).
- `MsActionSheet`, `MsGlassSheet`, `MsModal`, `MsConfirmDialog`,
  `MsPaymentSheet`, `MsShareSheet`, `MsContextMenu` — overlays.
- `MsGlobalDialogs` (host in root layout), `MsToast`, `MsNetworkBanner`,
  `MsOfflineBanner`, `ErrorBoundary` — app-wide UX.
- `KeyboardAwareScrollViewCompat` — keyboard avoidance on auth forms.
- `MsShortsPlayer`, `MsVideoPreview`, `MsVideoThumbnailPicker` — video UX.

## Infrastructure (`lib/`)

- `deep-link.ts` — share-token handling → exact destination screens.
- `screen-protection.ts` — calls `expo-screen-capture` + theme overrides;
  `plugins/withSecureWindow.js` sets `FLAG_SECURE` natively so screenshots/
  screen-record are blocked app-wide (Android; iOS FLAG_SECURE n/a).
- `session-storage.ts`, `posts-db.ts` (SQLite post cache), `video-cache.ts`
  (local video byte cache with stable logical URLs), `chat-cache.ts`.
- `biometric.ts`, `haptics.ts`, `pending-avatar.ts`, `nav.ts`,
  `api-client-react`.

## Interaction notes

- **Screens never fetch directly** — they go through services → contexts, so
  one mutation updates every consumer (wallet badge, like counts, comment
  counts, subscription buttons).
- **Server state is authoritative.** Optimistic UI is reconciled with the
  mutation response; the app never invents subscription tier / unlock state.
- **Deep links skip onboarding.** `s/[token]` resolves to the exact
  destination with no welcome/creator-onboarding/home flash; logged-out users
  land on Login and are returned to the destination after authenticating.
- **Screen protection is global**, including modals and full-screen media;
  it stays active across navigation and background/foreground on supported
  platforms.
