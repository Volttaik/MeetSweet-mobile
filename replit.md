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

- **Home search** — MagnifyingGlass button opens `MsSearchModal` (full-text post/user search with recent history)
- **Chat** — reactions (6-emoji quick-react + long-press picker), enhanced long-press menu (react/delete/report), image sending via expo-image-picker, paid-content bubble for locked messages
- **Create Post** — two-step onboarding: fill context (caption, visibility, paid toggle + credit price, categories, tags) → Continue → media picker modal → preview → publish
- **Creator Dashboard** — live data from `/creator/dashboard` and `/creator/subscribers`; stat cards, period performance, recent subscribers, quick-action buttons
- **Creator Profile** — tabbed layout: Drops / Reviews / About; star ratings, review cards, clean subscribe sheet (no more BottomSheet dependency)
- **Input focus borders** — `selectionColor={T.ACCENT}` added to new TextInputs; `MsInput` uses pink (#FF4473) focus border

## User preferences

- Keep the dark-first design — `Uniwind.setTheme('dark')` in `app/_layout.tsx`.
