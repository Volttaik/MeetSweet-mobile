# MeetSweet Expo client

## Overview

MeetSweet is an Expo 54 / React Native mobile client using Expo Router, HeroUI Native, and the existing service modules under `services/`.

The client talks to the deployed backend at `https://meetsweet-server.quizmi.space`. API paths in service modules are relative to `/api`; `services/api.ts` owns the base URL and response-envelope handling.

## Running on Replit

- Install dependencies with `pnpm install`.
- Start the preview workflow with `pnpm run dev`.
- Run static checks with `pnpm run typecheck`.
- `EXPO_PUBLIC_API_URL` may override the deployed backend URL, but defaults to the deployed MeetSweet API.

## User preferences

- Preserve the existing screens, navigation, animations, and visual design.
- Use live backend data; do not add dummy or mock data when a backend route is unavailable.