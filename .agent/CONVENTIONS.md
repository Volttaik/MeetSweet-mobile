# MeetSweet Mobile — Conventions

Rules to follow when editing this app. The server contract is in the sibling
repo `Meetsweet/.agent/BACKEND-SPEC.md` — the app must never break it.

## Structure

- **File-based routing** with expo-router: every screen is a file under
  `app/`. New screens go there; routes derive from the file path.
- **Contexts for cross-screen state** (`contexts/`): Auth, Wallet,
  PostActions, Notifications, BiometricLock. A new piece of state that many
  screens read belongs in a context; screen-local state stays in the screen.
- **Typed API clients in `services/`**, one file per domain, always through
  `services/api.ts` (never raw `fetch`). `api.ts` owns the base URL, Bearer
  header, and 401→refresh→retry behavior.
- **UI building blocks in `components/`** prefixed `Ms` (`MsButton`-style
  naming). Screens compose these; keep them presentational where possible.
- **Shared hooks in `hooks/`** (`useWalletBalance`, `useNetwork`, …).

## Auth & sessions (critical)

- Never render an authenticated screen's placeholder when the user is logged
  out. Push screens (settings, wallet, notifications) and the tabs layout
  redirect to Login via the auth guard. Do not remove these guards.
- Never store the access token in SecureStore permanently — keep it in
  memory (context) and the refresh token in `expo-secure-store`.
- Session expiry must route to Login — never leave the app in a broken
  half-authenticated state.
- Logout must clear tokens **and** per-account local caches (chat-cache,
  drafts, per-account prefs keyed by userId).

## Server state is authoritative

- Optimistic updates (`PostActionsContext`) are reconciled with the mutation
  response. Never invent subscription tier / unlock flags / prices client-side.
- Server responses drive UI state: like counts, comment counts, wallet
  balance, subscribe state. A mutation's response updates every consumer
  (e.g. WalletContext → header badge).
- If a feature looks stale, suspect a second local cache (chat-cache,
  posts-db) not being invalidated — don't "fix" it by making the server lie.

## Media & video

- **One video player**: `MsVideoPlayer` (react-native-video). Do not add a
  second player. Do not redesign the player without a concrete failing
  requirement.
- Keep the playing source URL stable — `video-cache` may store bytes but must
  never substitute a local URL for the live source.
- Uploads go through `services/media.ts` (direct-to-R2). Never reintroduce
  multipart uploads through a route handler (413).
- Seek behavior: verify the actual playback position changes; a moving seek
  bar is not proof.

## Deep links

- Share links resolve through `app/s/[token].tsx` → `lib/deep-link.ts` to the
  exact destination — no onboarding flash, no home-feed flash, no visible
  redirect. Logged-out recipients authenticate and are returned to the
  destination.
- Preserve this contract when touching onboarding or auth navigation.

## Screen protection

- `lib/screen-protection.ts` + `plugins/withSecureWindow.js` make capture
  prevention app-wide. Keep it global (root layout) — never scope it to a
  single screen. Modal/full-screen states must keep protection active.

## Styling & dependencies

- Tailwind-style classes via uniwind; theme tokens from `useColors` /
  `global.css`. Match surrounding screens' visual language.
- Only add a dependency if it's already used in the repo or genuinely
  required; prefer existing patterns (expo modules, react-native-video,
  react-query, zod).
- Typecheck before finishing: `pnpm typecheck` (tsc --noEmit).

## Verification

- `pnpm typecheck` must pass.
- For behavioral claims (session, sync, deep links, seek), verify in the
  running app — the repo historically ships QA scripts under `/tmp` that are
  intentionally not committed. Run `pnpm build:web` + serve + Playwright (or
  a device) rather than asserting from code alone.
