---
name: Local server workflow
description: Replit setup details for running the MeetSweet Expo client with its imported local API server.
---

The imported API server is a nested pnpm package. Its dependencies must be installed
from `backend_source/Meetsweet-main/server` with workspace isolation, otherwise pnpm
can place dependencies in the root workspace without linking the server's `next`
binary.

**Why:** The repository contains separate Expo and Next.js package manifests, while
the root workspace only declares the Expo app.

**How to apply:** Run the API on local port 3001. In this Replit setup, local port
3001 is exposed as HTTPS port 3000, so the Expo workflow's `EXPO_PUBLIC_API_URL`
must use `https://$REPLIT_DEV_DOMAIN:3000`, not `:3001`.