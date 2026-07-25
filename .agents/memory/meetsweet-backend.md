---
name: MeetSweet backend contract
description: Durable notes about the deployed backend contract and frontend integration boundaries.
---

The deployed backend is `https://meetsweet-server.quizmi.space`; client service paths are relative to `/api`.

**Why:** The imported Expo client was written against a different API shape. The deployed server wraps successful JSON in `{ ok: true, data: ... }` and returns validation errors as `{ ok: false, error, code }`.

**How to apply:** Keep base URL and envelope handling centralized in `services/api.ts`. Normalize snake_case backend records at service boundaries rather than redesigning screen components.

Authentication uses `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, and `/users/me`. Registration requires `username` (not optional — backend validates it). Password minimum is 8 characters.

## Confirmed Working Routes (live-tested 2026-07-25)

- `GET /api/healthz` → 200
- `POST /auth/login` → 401/200
- `POST /auth/register` → 422 validation (route live)
- `POST /auth/refresh` → needs `refresh_token` key (snake_case); frontend sends both `refreshToken` and `refresh_token` so it works
- `POST /auth/logout` → 401 (route live)
- `GET /users/me` → 401 (route live, GET only — PUT/PATCH return 405)
- `GET /posts` → 200 (feed works)
- `GET /posts/:id` → 404 for bad ID (route exists — 404 = post not found, not missing route)
- `POST /posts` → 401
- `DELETE /posts/:id` → 401
- `PATCH /posts/:id` → 401 (backend uses PATCH not PUT — frontend fixed)
- `POST /posts/:id/like` / `DELETE /posts/:id/like` → 401
- `GET /posts/:id/comments` → 200
- `POST /posts/:id/comments` → 401
- `POST /posts/:id/report` → 401
- `GET /notifications` → 401
- `POST /notifications/read-all` → 401 (frontend was sending PUT — fixed to POST)
- `GET /wallet` → 401
- `DELETE /messages/:id` → 401

## Missing Routes (404 as of 2026-07-25)

These backend routes are completely absent and must be implemented:
- `POST/DELETE /posts/:id/bookmark`
- `PUT/DELETE /posts/:id/comments/:commentId`
- `POST/DELETE /posts/:id/comments/:commentId/like`
- `GET/POST/DELETE /users/:username` and `/users/:username/follow`
- `GET /users/search?q=`
- `POST /media/upload` (multipart/form-data, field name `file`)
- `GET/POST /conversations`
- `GET/POST /conversations/:id/messages`
- `PUT /conversations/:id/archive`
- `PUT /notifications/:id/read`
- `GET /categories`
- `PUT/PATCH /users/me` (update profile — GET works but writes are 405)

## Frontend Fixes Applied (2026-07-25)

- `services/posts.ts` `editPost()`: PUT → PATCH (backend allows PATCH on /posts/:id)
- `services/notifications.ts` `markAllNotificationsRead()`: PUT → POST

## Backend Prompts

Full prompts for every missing backend endpoint are in `BACKEND_AUDIT_REPORT.md` at the project root. The next backend agent can use those directly without re-inspecting the Expo app.
