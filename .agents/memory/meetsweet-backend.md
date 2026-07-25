---
name: MeetSweet backend contract
description: Durable notes about the deployed backend contract, confirmed route status, and frontend integration boundaries.
---

Backend URL: `https://meetsweet-server.quizmi.space`; all service paths are relative to `/api`.

All responses use the `{ ok: true, data: ... }` envelope. Errors: `{ ok: false, error, code }`.

**Why:** Two-repo split — Expo frontend (this repo) + deployed Next.js backend (separate repo). Frontend service calls go through `services/api.ts apiFetch()` which prepends `/api` and handles the envelope/auth-retry.

---

## Route Status (live-tested 2026-07-25)

### Working (401 = auth guard fires = route implemented)

Auth: `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`
Users: `GET /users/me` (read-only — PATCH/PUT returns 405)
Posts: `GET /posts` (200), `GET /posts/:id` (200 for valid IDs), `POST /posts`, `PATCH /posts/:id`, `DELETE /posts/:id`
Post actions: `POST/DELETE /posts/:id/like`, `POST/DELETE /posts/:id/bookmark`, `POST /posts/:id/report`
Comments: `GET /posts/:id/comments` (200), `POST /posts/:id/comments`
Notifications: `GET /notifications`, `POST /notifications/read-all`
Wallet: `GET /wallet`
Messages: `DELETE /messages/:id`
Categories: `GET /categories` (200 — route exists, returns empty array — no seed data)
Media: `POST /media/upload` (401 — route exists)

### Missing (genuine 404 — backend not implemented)

- `GET /users/:username` — creator profiles
- `POST/DELETE /users/:username/follow` — follow/unfollow
- `GET /users/search?q=` — user search
- `GET/POST /conversations` — messaging
- `GET/POST /conversations/:id/messages` — messaging
- `PUT /conversations/:id/archive` — messaging
- `PUT /notifications/:id/read` — mark single notification read
- `PATCH/DELETE /posts/:id/comments/:commentId` — edit/delete comment
- `POST/DELETE /posts/:id/comments/:commentId/like` — comment likes

### Wrong method (backend accepts different method)

- `PUT /posts/:id` → 405 (use PATCH) — **frontend fixed**
- `PUT /notifications/read-all` → 405 (use POST) — **frontend fixed**
- `PUT/PATCH /users/me` → 405 (GET only — PATCH handler not implemented on backend)

---

## Known Backend Data Issues

- `GET /posts/:id` (single post) is MISSING these fields that `GET /posts` (list) includes: `creator_username`, `creator_display_name`, `creator_avatar`, `creator_is_verified`, `liked_by_me`, `bookmarked_by_me`. Frontend normalizer defaults gracefully.
- `GET /categories` → 200 but returns empty array. Route works; DB table has no seed data.
- `GET /posts?bookmarked=true` → 200 but filter likely ignored (unconfirmed).

---

## Frontend Fixes Applied (2026-07-25)

1. `services/posts.ts editPost()`: PUT → PATCH
2. `services/notifications.ts markAllNotificationsRead()`: PUT → POST
3. `app/create-post.tsx pickMedia()`: HEIC/HEIF MIME type normalised to `image/jpeg`; filename extension normalised from `.heic`/`.heif` to `.jpg`

**Why HEIC fix:** iOS returns `asset.mimeType = 'image/heic'` from expo-image-picker even though the file is transcoded to JPEG when `quality` is set. Backend rejects `image/heic` (not in allowed list). Fix: normalise before sending to `uploadMedia()`.

---

## Upload Pipeline (confirmed working after fix)

`POST /media/upload` exists and returns 401 without auth, validating the route. With auth + valid MIME type, the backend accepts the upload. FormData field name is `file`. No explicit Content-Type header (XHR sets multipart boundary automatically). Token injected as `Authorization: Bearer` header manually in `services/media.ts` (does not use apiFetch).

---

## GET /posts Response Shape (confirmed)

```json
{
  "ok": true,
  "data": {
    "posts": [
      {
        "id": "uuid",
        "caption": null,
        "visibility": "public",
        "status": "published",
        "like_count": 0, "comment_count": 0, "save_count": 0, "view_count": 0,
        "created_at": "ISO", "published_at": "ISO",
        "creator_id": "uuid", "creator_username": "string",
        "creator_display_name": "string", "creator_avatar": null,
        "creator_is_verified": false
      }
    ],
    "page": 1,
    "limit": 20
  }
}
```
Note: `media`, `liked_by_me`, `bookmarked_by_me` absent from list response. Frontend normalizer handles with `?? []` and `?? false`.

---

## Explore Screen

Uses `useGetExploreCatalog()` which calls `GET /api/posts?page=1&limit=100` and transforms posts into Creator objects client-side (workaround — no `/explore` endpoint). Functional but shows sparse content until creators post real media.

---

## Full Prompt Inventory

All backend fix prompts (A through K) are in `DIAGNOSTIC_REPORT.md` at project root. Future agents can use these directly without re-probing.

---

## Remaining Frontend Fix (blocked on backend)

`services/posts.ts editComment()` still uses `method: 'PUT'`. Change to `PATCH` once backend implements PROMPT H from `DIAGNOSTIC_REPORT.md`.
