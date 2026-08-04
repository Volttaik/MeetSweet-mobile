---
name: Backend endpoint fix — correct API routes
description: The backend does not implement /creators/:id/posts or /creators/:id/videos; use /posts?creator_id=:id for all creator content fetches. Shorts are excluded from the default response and need a separate content_type=short param.
---

# Backend Endpoint Fix

## Rule
`/creators/:id/posts` and `/creators/:id/videos` return **404** on this backend. Always use `/posts?creator_id=:id` instead.

**Why:** The backend was rebuilt and these creator-scoped sub-routes were not implemented. The unified `/posts` endpoint with query params is the correct contract.

**How to apply:** Anywhere the app fetches a creator's content feed, use `/posts?creator_id=:id`. This includes home feed assembly and profile post loading.

## Shorts exclusion
The backend excludes `content_type=short` posts from the default `/posts?creator_id=:id` response. To get a creator's shorts, make a **separate** request: `/posts?creator_id=:id&content_type=short`, then merge results.

**Why:** The backend treats shorts as a separate content bucket. `getPostsByCreator` now does both fetches in parallel and deduplicates by id.

## Video title vs caption
Backend video posts have `title: "..."` and `caption: ""` (empty). Do NOT use `post.caption` as the display title for videos — always prefer `post.title || post.caption`. The video watch page (`app/videos/[id].tsx`) was previously showing "Untitled" because it only checked `post.caption`.

## Explore double-title bug
In `previewToPost` (explore.tsx), do NOT set `caption = preview.title` for video/short posts. `MsPostCard` renders `post.title` (video title block) AND `post.caption` separately, causing the title to appear twice. For video posts set `caption = ''`.
