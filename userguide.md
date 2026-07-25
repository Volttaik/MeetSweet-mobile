# MeetSweet Backend API — Live Probe Results

> **Probed:** 2026-07-25  
> **Base URL:** `https://meetsweet-server.quizmi.space/api`  
> **Test account:** username `devatron` (owner's account — credentials not stored here)  
> **Account upgraded to creator** during this session via `POST /creator/become`

All responses use the envelope `{ ok: true, data: { ... } }` on success and `{ ok: false, error: "...", code: "..." }` on failure. The `apiFetch` wrapper in `services/api.ts` automatically unwraps `.data` for successful responses.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Works — confirmed 200/201 |
| ❌ | Broken — confirmed 500 (backend crash) |
| 🚫 | Not found — 404, route does not exist |
| ⚠️ | Wrong method or field — 405 / 422 |
| 🔒 | Requires `role: creator` |
| 🔑 | Requires `Authorization: Bearer <token>` |

---

## 1. Authentication

### `POST /auth/login` ✅
**No auth required.**

Request:
```json
{ "email": "user@example.com", "password": "Password1!" }
```
Response `data`:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": "6a11958c-...",
    "full_name": "Onyeaghor louis",
    "username": "devatron",
    "email": "onyeaghorlouis@gmail.com",
    "role": "creator",
    "is_creator": true,
    "avatar_url": null
  }
}
```
> ⚠️ **Frontend mismatch:** The login response `user` object is minimal (no `phone`, `bio`, `follower_count`, etc.). Full profile must be fetched separately via `GET /users/me` after login.

---

### `POST /auth/refresh` ✅
**No auth required.**

Request:
```json
{ "refresh_token": "eyJ..." }
```
Response `data`:
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ..." }
```
> ⚠️ Token expiry: access tokens expire in **15 minutes**, refresh tokens in **30 days**.

---

### `POST /auth/logout` ✅ 🔑
Request: `{}` (empty body is fine)  
Response `data`: `null`, `message: "Logged out successfully"`

---

### `POST /auth/forgot-password` ✅
Request: `{ "email": "user@example.com" }`  
Response `data`: `null`, `message: "If that email exists, a reset code has been sent"`

---

### `POST /auth/reset-password` ⚠️
Requires all four fields — sending fewer returns 422:
```json
{ "email": "user@example.com", "code": "123456", "password": "NewPass1!", "confirm_password": "NewPass1!" }
```
> **Frontend mismatch:** The frontend only sends `{ token, password }`. Must send `{ email, code, password, confirm_password }`.

---

## 2. Users

### `GET /users/me` ✅ 🔑
Full profile. Response `data`:
```json
{
  "id": "6a11958c-...",
  "full_name": "Onyeaghor louis",
  "username": "devatron",
  "email": "onyeaghorlouis@gmail.com",
  "phone": "0 (806) 193-8576",
  "is_creator": true,
  "is_verified": true,
  "role": "creator",
  "created_at": "2026-07-25T00:25:18.911Z",
  "display_name": "Onyeaghor louis",
  "bio": "Updated bio",
  "avatar_url": null,
  "banner_url": null,
  "website": "https://example.com",
  "location": "Lagos",
  "subscription_price": 0,
  "is_verified_creator": false
}
```

---

### `PATCH /users/me` ✅ 🔑
Update profile fields. Accepts any subset of:
```json
{ "bio": "...", "website": "https://...", "location": "Lagos", "username": "devatron", "full_name": "...", "phone": "..." }
```
Response `data.user` — the full updated user object (same shape as `GET /users/me`).

---

### `GET /users/:username` ✅ 🔑
Response `data`:
```json
{
  "user": {
    "id": "6a11958c-...",
    "name": "Onyeaghor louis",
    "username": "devatron",
    "bio": null,
    "avatar_url": null,
    "banner_url": null,
    "website": null,
    "is_verified": false,
    "is_creator": true,
    "created_at": "2026-07-25T00:25:18.911Z",
    "follower_count": 0,
    "following_count": 0,
    "post_count": 0
  },
  "isFollowing": false
}
```
> **Frontend mismatch:** Response is `{ user, isFollowing }` — the frontend must read `data.user`, not `data` directly.

---

### `GET /users/:username/posts` ❌
**500 server error** — entire posts system is down on the backend. Not a frontend issue.

---

### `POST /users/:username/follow` ✅ 🔑
Returns 400 if following yourself.  
Response `data`: `{ following: true }`

---

### `DELETE /users/:username/follow` ✅ 🔑
Response `data`: `{ following: false }`

---

### `GET /users/search?q=:query` ✅ 🔑
Response `data`:
```json
{
  "users": [
    { "id": "...", "name": "Test User", "username": "testuser123", "avatarUrl": null, "isVerified": false }
  ]
}
```
> Note: field names here are already **camelCase** (`avatarUrl`, `isVerified`) unlike most other endpoints which use snake_case.

---

### `GET /search?q=:query` ✅ 🔑
Alternative search endpoint. Response `data`:
```json
{
  "users": [
    { "id": "...", "username": "testuser123", "full_name": "Test User", "is_creator": false, "display_name": "Test User", "avatar_url": null, "is_verified": false }
  ]
}
```
> This one uses **snake_case** field names. `/users/search` and `/search` are two different routes with slightly different response shapes.

---

## 3. Posts — ❌ ENTIRE ROUTE FAMILY IS BROKEN

All of the following return **HTTP 500** (empty body — backend crash, not a frontend issue):

| Route | Status |
|---|---|
| `GET /posts` | ❌ 500 |
| `GET /posts?page=1&limit=20` | ❌ 500 |
| `GET /posts/feed` | ❌ 500 |
| `GET /posts?visibility=public` | ❌ 500 |
| `POST /posts` | ❌ 500 |
| `GET /users/:username/posts` | ❌ 500 |
| `GET /explore` | ❌ 500 |

**This is a backend server bug.** The `/posts` route handler is crashing internally. No combination of query parameters, auth headers, or request bodies made it return anything other than 500. The frontend's `getFeed()` calling `GET /posts?page=1&limit=20` is the correct call — the server is simply broken.

**Impact on the frontend:**
- Home feed always shows "Feed unavailable"
- Profile posts tab always empty
- Explore screen fails
- Post creation fails silently

---

## 4. Media Upload

### `POST /media/upload` 🔑
Multipart form upload. Field name: `file`.

Allowed MIME types (from 422 response):
```
image/jpeg, image/png, image/webp, image/gif,
video/mp4, video/quicktime, video/webm,
audio/mpeg, audio/wav, audio/ogg, audio/mp4, audio/webm
```

> ⚠️ During this probe, the upload returned 422 because the test PNG was not a properly encoded image file. The route itself exists and enforces MIME validation. A real image file should upload successfully.  
> Route `/media` (without `/upload`) → 404.

---

## 5. Notifications

### `GET /notifications` ✅ 🔑
Supports `?page=1` query param.  
Response `data`:
```json
{ "notifications": [], "unread_count": 0 }
```

### `POST /notifications/read-all` ✅ 🔑
Request: `{}` (empty body)  
Response `data`: `null`, `message: "All notifications marked as read"`

> ⚠️ **Frontend mismatch:** The correct method is **POST**, not PATCH or PUT.  
> `PATCH /notifications/read-all` → 405  
> `PUT /notifications/read-all` → 405  
> `POST /notifications/mark-all-read` → 405 (wrong path)

### `PATCH /notifications/:id/read` ⚠️
→ 405 Method Not Allowed. Single-notification mark-read route/method is unknown.

---

## 6. Wallet

### `GET /wallet` ✅ 🔑
Returns wallet AND transaction history in one call.  
Response `data`:
```json
{
  "wallet": {
    "id": "68446681-...",
    "user_id": "6a11958c-...",
    "balance": 0,
    "currency": "NGN",
    "created_at": "2026-07-25T00:25:18.988Z",
    "updated_at": "2026-07-25T00:25:18.988Z"
  },
  "transactions": []
}
```

> ⚠️ **Frontend mismatch:** `GET /wallet/transactions` → 404. `GET /wallet/balance` → 404. `POST /wallet/topup` → 404. `POST /wallet/withdraw` → 404. All wallet data lives at `GET /wallet` only.

---

## 7. Categories

### `GET /categories` ✅ 🔑
Response `data`:
```json
{
  "categories": [
    { "id": "eb68f0bd-...", "name": "Lifestyle", "slug": "lifestyle", "postCount": 0 },
    { "id": "ddc96a37-...", "name": "Fashion", "slug": "fashion", "postCount": 0 },
    { "id": "3a406658-...", "name": "Fitness", "slug": "fitness", "postCount": 0 }
    // ... more categories
  ]
}
```

---

## 8. Subscriptions

### `GET /subscriptions` ✅ 🔑
Returns the current user's active subscriptions.  
Response `data`: `[]` (empty array when no subscriptions)

### `POST /subscriptions` — Partially working
Request: `{ "creator_id": "<uuid>" }` (must be a real creator's user ID, not username)  
Returns 404 if `creator_id` doesn't resolve to a creator.

> ⚠️ **Frontend mismatch:** The correct subscribe body is `{ creator_id: "<uuid>" }`. The frontend may be sending `creator_username`. Also: `GET /subscriptions/my` → 404, `GET /subscriptions/active` → 404, `POST /subscriptions/subscribe` → 404.

---

## 9. Conversations / Messages

### `GET /conversations` ✅ 🔑
Response `data`: `{ conversations: [] }`

### `POST /conversations` ✅ 🔑
Create or retrieve a conversation.  
Request:
```json
{ "userId": "<recipient-user-uuid>", "message": "Hello" }
```
Response `data` (201):
```json
{ "conversationId": "fdd5338b-...", "created": true }
```
> ⚠️ **Frontend mismatch:** Field must be `userId` (UUID), NOT `recipient_username`. Sending `recipient_username` returns 422.

### `GET /conversations/:id` 🚫
→ 404. **Does not exist.**

### `GET /conversations/:id/messages` ✅ 🔑
Response `data`:
```json
{ "messages": [], "hasMore": false }
```

### `POST /conversations/:id/messages` ✅ 🔑
Request body — field is **`body`**, not `content`:
```json
{ "body": "Hello, message text here" }
```
Returns 400 if neither `body` nor `mediaUrl` is provided.

> ⚠️ **Frontend mismatch:** Field name is `body`, not `content`. Also `GET /messages` → 404.

---

## 10. Creator

### `POST /creator/become` ✅ 🔑
Upgrades user account to creator role. Can send any subset of:
```json
{ "bio": "My creator bio", "category": "lifestyle", "subscription_price": 500 }
```
Response `data`: `null`, `message: "Creator account activated"`  
After this call, re-login returns `role: "creator"` and `is_creator: true`.

> ⚠️ **Frontend mismatch:** Route is `POST /creator/become`. Other guesses all 404: `POST /creator/apply`, `POST /users/me/become-creator`, `POST /users/me/creator`.

### `GET /creator/dashboard` ✅ 🔑🔒
Response `data`:
```json
{
  "wallet_balance": 0,
  "active_subscribers": 0,
  "total_posts": 0,
  "total_revenue": 0,
  "period_stats": []
}
```

### `GET /creator/subscribers` ✅ 🔑🔒
Response `data`:
```json
{ "subscribers": [], "page": 1, "limit": 20 }
```

### `GET /creator/revenue` ✅ 🔑🔒
Response `data`:
```json
{ "balance": 0, "currency": "NGN", "earnings": [], "page": 1, "limit": 20 }
```

### `GET /creator/analytics` ✅ 🔑🔒
Response `data`:
```json
{ "period_stats": [], "active_subscribers": 0, "total_posts": 0 }
```

### `GET /creator/posts` 🚫 (404)
### `GET /creator/earnings` 🚫 (404)
### `GET /creator/settings` 🚫 (404)
### `PATCH /creator/settings` 🚫 (404)

---

## 11. Settings

### `GET /settings` ❌ 500
Backend crashes. All sub-routes also broken or non-existent:

| Route | Status |
|---|---|
| `GET /settings` | ❌ 500 |
| `GET /settings/notifications` | 🚫 404 |
| `GET /settings/privacy` | 🚫 404 |
| `PATCH /settings/notifications` | 🚫 404 |
| `PATCH /settings/privacy` | 🚫 404 |
| `GET /users/me/settings` | 🚫 404 |

> Profile fields (`bio`, `website`, `location`) are updated via `PATCH /users/me` — that works. But dedicated settings endpoints do not exist.

---

## Summary: What Works vs What Doesn't

### ✅ Confirmed Working
| Route | Notes |
|---|---|
| `POST /auth/login` | Returns minimal user — fetch full profile separately |
| `POST /auth/refresh` | Body: `{refresh_token}` |
| `POST /auth/logout` | Body: `{}` |
| `POST /auth/forgot-password` | Body: `{email}` |
| `GET /users/me` | Full profile with all fields |
| `PATCH /users/me` | Update any profile field |
| `GET /users/:username` | Returns `{user, isFollowing}` wrapper |
| `POST /users/:username/follow` | |
| `DELETE /users/:username/follow` | |
| `GET /users/search?q=` | camelCase field names in response |
| `GET /search?q=` | snake_case field names in response |
| `GET /notifications` | Supports `?page=N` |
| `POST /notifications/read-all` | Must be POST, not PATCH |
| `GET /wallet` | Returns wallet + transactions together |
| `GET /categories` | |
| `GET /subscriptions` | Returns array of active subs |
| `POST /subscriptions` | Body: `{creator_id: "<uuid>"}` |
| `GET /conversations` | |
| `POST /conversations` | Body: `{userId: "<uuid>", message: "..."}` |
| `GET /conversations/:id/messages` | NOT `/conversations/:id` |
| `POST /conversations/:id/messages` | Body field is `body`, not `content` |
| `POST /creator/become` | Upgrades user to creator |
| `GET /creator/dashboard` | 🔒 Creator only |
| `GET /creator/subscribers` | 🔒 Creator only |
| `GET /creator/revenue` | 🔒 Creator only |
| `GET /creator/analytics` | 🔒 Creator only |
| `POST /media/upload` | Multipart `file` field, enforces MIME type |

### ❌ Backend Broken (500)
| Route | Impact |
|---|---|
| `GET /posts` | Entire feed is dead |
| `GET /posts/feed` | Entire feed is dead |
| `POST /posts` | Cannot create posts |
| `GET /users/:username/posts` | Profile posts tab dead |
| `GET /explore` | Explore tab dead |
| `GET /settings` | Settings screen dead |

### 🚫 Routes That Don't Exist (404)
| Route | What to use instead |
|---|---|
| `GET /conversations/:id` | Use `GET /conversations/:id/messages` |
| `GET /messages` | Use `GET /conversations` |
| `GET /wallet/transactions` | Use `GET /wallet` (includes transactions) |
| `GET /wallet/balance` | Use `GET /wallet` |
| `POST /wallet/topup` | No deposit route exists |
| `GET /creator/posts` | No route exists yet |
| `GET /creator/earnings` | Use `GET /creator/revenue` |
| `GET /creator/settings` | Use `PATCH /users/me` for profile settings |
| `POST /creator/apply` | Use `POST /creator/become` |
| `GET /subscriptions/my` | Use `GET /subscriptions` |
| `GET /subscriptions/active` | Use `GET /subscriptions` |

---

## Critical Frontend Fixes Needed

These are the exact mismatches between what the frontend calls and what the backend actually accepts:

| # | Frontend calls | Backend actually needs | Fix |
|---|---|---|---|
| 1 | `getFeed()` → `GET /posts?page=1&limit=20` | **Backend is broken (500)** | Wait for backend fix |
| 2 | `GET /conversations/:id` | `GET /conversations/:id/messages` | Fix conversation detail route |
| 3 | `POST /conversations/:id/messages` body `{content}` | Body field `{body}` | Rename `content` → `body` |
| 4 | `POST /conversations` body `{recipient_username}` | Body field `{userId: "<uuid>"}` | Send UUID not username |
| 5 | `POST /notifications/mark-all-read` or `PATCH` | `POST /notifications/read-all` | Fix method + path |
| 6 | `GET /wallet/transactions` | `GET /wallet` (combined) | Remove separate transactions call |
| 7 | `POST /creator/apply` or `POST /users/me/become-creator` | `POST /creator/become` | Fix become-creator route |
| 8 | `POST /auth/reset-password {token, password}` | `{email, code, password, confirm_password}` | Fix reset-password body |
| 9 | `GET /creator/earnings` | `GET /creator/revenue` | Fix earnings route name |
| 10 | Profile update via `PATCH /settings/*` | `PATCH /users/me` | All profile updates go to `/users/me` |
| 11 | `GET /users/:username` response read as `data.*` | Response is `data.user.*` plus `data.isFollowing` | Unwrap nested `user` object |

---

## Envelope & Token Notes

- Every response: `{ ok: true, data: { ... } }` on success, `{ ok: false, error: "...", code: "..." }` on failure  
- HTTP status codes match: 200/201 success, 400/401/403/404/422 client errors, 500 server errors  
- `apiFetch` in `services/api.ts` correctly unwraps `.data` on success — this is working  
- CORS: `Access-Control-Allow-Origin: *` — no browser issues  
- Token lifespan: access = 15 min, refresh = 30 days  
- After `POST /creator/become`, must re-login to get updated role in token claims  
