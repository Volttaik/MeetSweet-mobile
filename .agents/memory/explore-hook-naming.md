---
name: Explore catalog hook naming
description: Which hook to use for the explore catalog — the local one vs the generated stub
---

# Explore catalog hook naming

`useLocalExploreCatalog` (in `services/explore.ts`) is the real, working hook — it builds the catalog from `GET /api/posts` since the backend has no `/api/explore` endpoint.

`useGetExploreCatalog` (in `lib/api-client-react/generated/api.ts`) is an auto-generated stub that tries to call the non-existent `/api/explore` endpoint. It will always fail with a 404.

**Why:** The backend audit confirmed `GET /api/explore` returns 404. Both `app/(tabs)/explore.tsx` and `app/creator/[id].tsx` had been calling the generated stub, causing a crash (calling an undefined variable since it wasn't imported).

**How to apply:** Any screen that needs the explore catalog must import and call `useLocalExploreCatalog`. Never import `useGetExploreCatalog` without first confirming the backend endpoint exists.
