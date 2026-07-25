---
name: MeetSweet backend contract
description: Durable notes about the deployed backend contract and frontend integration boundaries.
---

The deployed backend is `https://meetsweet-server.quizmi.space`; client service paths are relative to `/api`.

**Why:** The imported Expo client was written against a different API shape. The deployed server wraps successful JSON in `{ ok: true, data: ... }` and returns validation errors as `{ ok: false, error, code }`.

**How to apply:** Keep base URL and envelope handling centralized in `services/api.ts`. Normalize snake_case backend records at service boundaries rather than redesigning screen components.

Authentication uses `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, and `/users/me`. Registration returns a `user_id` and requires email verification before a session is issued.

Live compatible content routes include `/posts`, `/posts/:id`, and `/posts/:id/comments`. The deployed API currently responds 404/405 for imported routes such as `/explore`, `/categories`, `/media/upload`, `/users/search`, `/conversations`, and post bookmark/archive routes; the client must surface those as real backend errors rather than mock them.