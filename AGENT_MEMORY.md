# Agent Memory — MeetSweet

This file is the durable hand-off context for the Freebuff coding agent. It is
committed to git so that if the workspace (a temp dir) is reset, the next agent
can reconstruct full context from this file plus `git log`.

## Repos

- **Mobile app** — `Volttaik/MeetSweet-mobile` (this workspace root).
  Remote `origin` = `https://github.com/Volttaik/MeetSweet-mobile.git`.
  A local platform backup remote `gitsafe-backup` = `git://gitsafe:5418/backup.git`.
- **Server** — `Volttaik/Meetsweet` (a separate repo; clone it into
  `.meetsweet-server/` inside this workspace when you need to edit it).
  Remote = `https://github.com/Volttaik/Meetsweet.git`.

## Environment

- Replit, PNPM workspace. Expo (Metro) dev server on port **5000**.
- Mobile API base: `https://meetsweet.space` (production). Override via
  `EXPO_PUBLIC_API_URL`. Every request needs header `X-Client-App-Id: meetsweet-mobile`
  (the client's `services/api.ts` adds it automatically).
- EAS account: `prcon` / `prcons-team`. Build profile `preview` = Android APK (internal).

## Live infrastructure

- **Turso** is the production database (a libsql URL + auth token; provided
  in-session, do not commit the token).
- **Server** is a Next.js app deployed to **Vercel** → `https://meetsweet.space`
  (config at `Meetsweet/server/vercel.json`, `next.config.ts`).

## What has already been fixed & pushed

Original 12-area bug-fix pass, then a 3-hour audit pass. Both repos pass
`tsc --noEmit`. Highlights:

- Explore video posts silently dropped → `buildVideoRow`/`buildShortRow` now emit
  flat `creator_*` fields.
- Subscription correctness → `subscribe()` returns authoritative `subscriber_count`;
  creator route returns `subscription_tier`; client applies state immediately.
- Creator profile showed internal IDs → `getCreatorById` no longer falls back to the
  route param for `username`/`name`.
- Chat opening spinner → shimmer skeleton with fade-in.
- Chat header menu glitch → rewritten `MsChatHeaderMenu` (slide+fade, separated backdrop).
- Normal post comments → reuse the shared `CommentsModal` (Shorts/Video sheet).
- Idempotent chatroom open → checks local room cache by peer id before creating.
- Server notification privacy bug → `push.ts` now respects `user_settings.notif_*`.
- `transactions.reference` unique index declared in Drizzle schema (already applied in prod).

## Latest session (current work)

1. **Explore "no content"** — `creatorEmbeddedInItem` in
   `MeetSweet-mobile/services/explore.ts` used the POST `id` instead of
   `creator_id` when flat creator fields were present, so previews never matched
   their author and every item was dropped. Fixed to use
   `src.creator_id ?? src.creatorId ?? src.id`.
2. **Creator pages showing "Creator" placeholder** — root cause was the live DB:
   every user had `is_creator = 0` and `devatron` had `is_active = 0`, so
   `GET /api/creators/:id` returned "Creator not found". Ran a one-off Turso UPDATE
   to set `is_creator = 1, is_active = 1, role = 'creator'` for the 4 users who own
   published posts (devatron, ifeoma, iamdublin, durk). Verified endpoints return
   real data afterward.
3. **Chat shimmer redesign** — `MsShimmerChatMessage`/`MsShimmerChatList` now use
   deterministic widths (no `Math.random` flicker), the real bubble colours
   (`#1C1C23` incoming, `#28282F` outgoing), and the chat-room skeleton input bar
   mirrors the real composer (sticker / pill / attach / camera / accent send).

## How to resume / verify

```bash
# Mobile typecheck
cd MeetSweet-mobile && npx tsc -p tsconfig.json --noEmit
# Server typecheck (after pnpm install in .meetsweet-server/server)
cd .meetsweet-server/server && pnpm exec tsc --noEmit
# Push mobile (origin has no token embedded — pass it inline)
git push https://<GH_TOKEN>@github.com/Volttaik/MeetSweet-mobile.git main
# Push server (its origin embeds the token)
cd .meetsweet-server && git push origin main
```

## Credentials (NOT committed here — re-provide in session)

- GitHub push token (`ghp_…`) — needed to push the mobile repo.
- Expo / EAS token — needed for `eas build`.
- Turso DB URL + auth token — needed to touch the live DB.

These values are in the Freebuff conversation history; retrieve them from there
or regenerate. Do not commit raw secrets to the public repos.

## Known remaining work / notes

- **Paystack `charge.success` webhook** is still missing — wallet credit relies on
  the client calling `verify-paystack`. Needs a webhook secret + signature check.
- **Legacy `/conversations` + `/messages` routes** are no longer referenced by the
  mobile app (it uses `/chat-rooms` + `/comment-rooms`) — candidates for removal.
- Junk assets were removed from HEAD but still exist in git history; purging needs
  a `git filter-repo` history rewrite.
- The mobile repo's `origin/main` local tracking ref can look stale because pushes
  were done by inline URL — fetch by URL to confirm true remote state.
