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

## Turso schema setup

The external LibSQL/Turso database is configured through the secure
`TURSO_DATABASE_URL` environment value and `TURSO_AUTH_TOKEN` secret. The
migration is reproducible from source:

```bash
pnpm run db:migrate
pnpm run db:check
```

The migration is safe to rerun and verifies the `posts.unlock_price` column
and `user_settings` table after applying them. Do not commit database URLs or
tokens to project files.

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

## User preferences

- Keep the dark-first design — `Uniwind.setTheme('dark')` in `app/_layout.tsx`.
