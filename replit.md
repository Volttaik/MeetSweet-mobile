# MeetSweet

MeetSweet is an Expo/React Native social app for discovering creators, posts, albums, messaging, notifications, onboarding, and wallet features.

## Run & Operate

- `pnpm --dir MeetSweet-mobile install --frozen-lockfile` — install the mobile app dependencies
- `pnpm --dir MeetSweet-mobile run dev` — start Metro for Expo Go on port 8081
- Scan the Expo Go QR code or use the `exp://` URL printed by the workflow
- `pnpm --dir MeetSweet-mobile run typecheck` — typecheck the mobile app

## Stack

- Expo SDK 54, Expo Router, React Native 0.81, and TypeScript
- pnpm workspace with a standalone `MeetSweet-mobile` package
- Metro is proxied through `REPLIT_EXPO_DEV_DOMAIN` for Expo Go
- The app API base is configured with `EXPO_PUBLIC_API_URL` when needed

## Where things live

- `MeetSweet-mobile/app/` — Expo Router screens
- `MeetSweet-mobile/components/` — shared UI components
- `MeetSweet-mobile/services/` — API and feature service modules
- `MeetSweet-mobile/app.json` — Expo configuration

## Architecture decisions

- Keep the imported mobile project structure and its standalone lockfile.
- Use Expo Go-compatible modules rather than requiring a custom development build.
- Use port 8081 for Metro so Replit's Expo proxy can forward the Expo Go manifest.

## Product

MeetSweet provides a social creator experience with content discovery, creator tools, albums, direct chat, notifications, registration flows, and wallet/payout screens.

## User preferences

No additional preferences recorded.

## Gotchas

- Start the `MeetSweet Expo` workflow instead of running Expo with a custom local port.
- If dependencies are missing after import, reinstall with the mobile lockfile before restarting Metro.

## Pointers

- The Replit workflow is defined in `.replit` and runs `pnpm --dir MeetSweet-mobile run dev`.