# MeetSweet Mobile — Agent Workspace

This `.agent/` folder is the canonical knowledge base for AI agents working on
the **MeetSweet mobile app** (this repo). Read `README.md` first, then dive
into whatever is relevant to your task.

## Repo layout

```
MeetSweet-mobile/                      ← monorepo root (this repo)
├── .agent/                            ← you are here
│   ├── README.md                      ← this file (start here)
│   ├── AGENT_MEMORY.md                ← full accumulated session memory (858 lines)
│   ├── BACKEND-ISSUES.md              ← archived backend issue history + mobile contracts
│   ├── ARCHITECTURE.md                ← app architecture & component interactions
│   ├── components.json                ← machine-readable map of routes/contexts/services
│   ├── data-flows.md                  ← auth, wallet, real-time, deep links, media, video
│   ├── CONVENTIONS.md                 ← conventions & pitfalls
│   └── env.json                       ← EXPO_PUBLIC_* variables
├── MeetSweet-mobile/                  ← the actual Expo app (work here)
│   ├── app/                           ← expo-router file-based routes (screens)
│   ├── components/                    ← Ms* UI components (60+)
│   ├── contexts/                      ← Auth / Wallet / Notifications / PostActions / BiometricLock
│   ├── services/                      ← typed API clients (one per domain)
│   ├── hooks/                         ← shared hooks (wallet balance, network, offline queue, …)
│   ├── lib/                           ← deep links, screen protection, SQLite caches, biometric
│   ├── plugins/                       ← config plugins (withSecureWindow.js — FLAG_SECURE)
│   └── (package.json, app.json, …)
├── lib/                               ← shared API client/spec/zod libs (workspace packages)
├── artifacts/                         ← generated API clients + mockup sandbox
├── scripts/                           ← workspace tooling (render-install-images, post-merge)
└── (root files: package.json, pnpm-workspace.yaml, tsconfig.base.json, …)
```

## Quickstart

```bash
cd MeetSweet-mobile/MeetSweet-mobile
pnpm install
cp .env.example .env.local   # set EXPO_PUBLIC_API_URL to the backend origin
pnpm dev                     # Expo dev server (Metro), :8081
pnpm dev:web                 # web target
pnpm typecheck               # tsc --noEmit
pnpm build:web               # expo export --platform web → dist/
```

The backend is the sibling repo `Meetsweet` (Next.js API). The app talks to it
through `services/api.ts`, which reads `EXPO_PUBLIC_API_URL`.

## How the app is put together (30-second version)

- **Expo Router (SDK 54)** — every file in `app/` is a screen. Root layout
  `app/_layout.tsx` mounts the provider stack (Auth → Wallet → Biometric →
  Notifications → PostActions) inside a global error boundary.
- **`app/index.tsx`** boots the app: valid session → `(tabs)`; otherwise the
  Welcome flow (`welcome` → `get-started` → `register`/`login`).
- **4 tabs** (`app/(tabs)/`): Home, Explore, Messages, Profile. The tab layout
  is auth-gated — a logged-out user is redirected to Welcome/Login instead of
  seeing placeholder shells.
- **Contexts** hold cross-screen state: `AuthContext` (tokens + refresh +
  logout), `WalletContext` (balance, shared by wallet screen + header badge),
  `PostActionsContext` (optimistic likes/comments), `NotificationsContext`,
  `BiometricLockContext`.
- **`services/*.ts`** are typed API clients; `services/api.ts` is the fetch
  wrapper that attaches the Bearer token, refreshes on 401, and retries once.
- **Deep links:** `meetsweet://s/<token>` → `app/s/[token].tsx` →
  `lib/deep-link.ts` resolves share tokens to post/album/creator screens.
- **Screen protection:** `lib/screen-protection.ts` + `plugins/withSecureWindow.js`
  (native `FLAG_SECURE`) make the app non-capturable app-wide on Android.

## Docs map

| When you need… | Read |
|---|---|
| History, decisions, gotchas | `AGENT_MEMORY.md` |
| Which screen/context/service does what | `components.json` + `ARCHITECTURE.md` |
| How a feature flows end to end | `data-flows.md` |
| What the backend must return | `BACKEND-ISSUES.md` §5 + sibling repo `Meetsweet/.agent/BACKEND-SPEC.md` |
| Style rules before editing | `CONVENTIONS.md` |

## House rules

- The server contract is authoritative — the app must never fabricate
  server-computed state (subscription tier, unlock flags, prices).
- `.agents/` (with an `s`) inside the app folder is platform-managed; the
  docs live in this `.agent/` folder.
- QA/debug scripts are intentionally not committed.
