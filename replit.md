# MeetSweet Mobile

Expo / React Native app (web-compatible via Expo Router + React Native Web).

## Running the app

```
pnpm run dev
```

Starts Metro Bundler on port 5000. Preview opens in browser (Expo web target).
Scan the QR code from the terminal to open in Expo Go on a physical device.

## Backend

Live API: `https://meetsweet-server.quizmi.space/api`

Set `EXPO_PUBLIC_API_URL` in `.env.local` to point at a different environment.
The default in `services/api.ts` already points to the production server.

### Local backend on Replit

The imported Next.js API server is under `backend_source/Meetsweet-main/server`.
The `Start Backend` workflow runs it on local port `3001`, exposed through Replit's
HTTPS port `3000`. The Expo workflow uses:

```text
https://$REPLIT_DEV_DOMAIN:3000/api
```

Both `Start application` and `Start Backend` must be running to exercise the local
API from Expo Go. Paystack and Resend remain intentionally unset.

## Architecture

| Layer | Location |
|---|---|
| Screens | `app/` (Expo Router file-based routing) |
| Tab shell | `app/(tabs)/` |
| Services (API) | `services/` |
| Generated API client | `lib/api-client-react/` (React Query hooks) |
| Components | `components/` |
| Theme / colours | `constants/theme.ts`, `constants/colors.ts` |
| Auth context | `contexts/AuthContext.tsx` |

## API contract notes

- All backend responses are wrapped in `{ok: true, data: {...}}` — `apiFetch` in `services/api.ts` unwraps this automatically.
- Backend field names are snake_case; every service file has a `normalize*` function that maps them to the camelCase interfaces the screens expect.
- Upload endpoint `POST /media/upload` requires `Authorization: Bearer <token>` and a `multipart/form-data` body with a `file` field.
- Allowed upload MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `video/quicktime`, `video/webm`. `create-post.tsx` normalises device-reported types to this list.

## Backend endpoints NOT yet implemented (return 404)

These features will fail gracefully (empty state, no crash) until the backend adds them:

- `GET/POST /conversations` — chat/messaging
- `GET /users/:username` — public creator profile
- `POST/DELETE /users/:username/follow` — follow/unfollow
- `GET /users/search` — user search in new-message modal
- `PATCH/PUT /users/me` — edit profile (only GET is implemented)

## Key features implemented

- **Home search** — `MsSearchModal`: compact 36px bar, shimmer skeleton loading, trending hashtag chips (horizontal scroll), per-item delete in recents, smaller result text (13/11px)
- **Paid content overlay** — `MsPremiumContent`: compact blur overlay (32px lock icon, 34px unlock button), dual-button layout (unlock + quick-pay with credits), animated fade-out on unlock
- **Locked content** — `MsLockedContent`: compact 42px circle, 12px button, gradient scrim
- **Context menu** — `MsContextMenu`: spring-animated bottom sheet for long-press actions, grouped items, drag handle, compact item rows
- **Swipe-to-reply** — `MsSwipeableMessage`: PanResponder swipe-right gesture, spring snap-back, haptic trigger at threshold
- **Double-tap like** — `MsDoubleTapLike`: heart burst overlay with spring physics, haptic feedback
- **Credit badge** — `MsCreditBadge`: compact header badge with pop animation on balance change
- **Video gesture overlay** — `MsVideoGestureOverlay`: double-tap left=−10s, double-tap right=+10s, swipe up/down=volume, single tap=controls
- **Video thumbnail picker** — `MsVideoThumbnailPicker`: compact 80px preview with custom image upload
- **Shimmer system** — `MsShimmer`, `MsSkeletonFeed`: reusable shimmer primitives for all loading states
- **Voice bubble** — `MsVoiceBubble`: redesigned with accent-tinted background, distinct from text bubbles, 36px play button, 24px waveform, 3px progress bar, accent border
- **Post card** — Compact sizing: 13px author, 11px meta, 12px actions, 14px padding (was 20px)
- **Chat** — reactions, enhanced long-press menu, image/voice sending, paid-content bubble
- **Create Post** — two-step: context → media picker → preview → publish; custom thumbnail upload
- **Creator Dashboard** — live `/creator/dashboard` + `/creator/subscribers` data

## User preferences

- Keep the dark-first design — `Uniwind.setTheme('dark')` in `app/_layout.tsx`.
