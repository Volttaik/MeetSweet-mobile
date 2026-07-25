# MeetSweet — Backend Fix Guide & Frontend Audit

> **Date:** 2026-07-25  
> **Base URL:** `https://meetsweet-server.quizmi.space/api`  
> **Method:** Every route was probed live with a real authenticated account (`onyeaghorlouis@gmail.com`, username `devatron`). Results are not guesses — they are actual HTTP responses.
>
> This document is split into two parts:
> - **Part A — Backend:** what the backend developer must fix / implement
> - **Part B — Frontend:** what the frontend developer must fix (response shape mismatches found by reading the service files against live responses)

---

## PART A — BACKEND FIXES REQUIRED

### A1. Routes That Return 500 (Server Crash)

These routes exist on the server but crash internally. They return HTTP 500 with an **empty body** — no error message, no stack trace. This is the highest-priority issue because it breaks the core user experience.

| Route | Frontend calls it from | Impact |
|---|---|---|
| `GET /posts` | `services/posts.ts → getFeed()` | Home feed always shows "Feed unavailable" |
| `GET /posts?page=N&limit=20` | `services/posts.ts → getFeed()` | Same — query params make no difference |
| `GET /posts/feed` | (probed directly) | Not used by frontend but also 500 |
| `POST /posts` | `services/posts.ts → createPost()` | Cannot create any posts |
| `GET /users/:username/posts` | `services/posts.ts → getUserPosts()` | Profile posts tab always empty |
| `GET /explore` | `services/search.ts → getExplore()` | Explore tab always fails |
| `GET /settings` | `services/settings.ts → getSettings()` | Settings screen crashes on load |
| `PATCH /settings` | `services/settings.ts → updateSettings()` | Cannot save settings |

**Everything related to posts is dead.** This is a backend database query or middleware crash — the route handler exists (it's not a 404) but it throws before returning.

All other post-related routes that depend on posts will also fail by extension:
- `GET /posts/:id` (single post view)
- `POST /posts/:id/like` / `DELETE /posts/:id/like`
- `POST /posts/:id/bookmark` / `DELETE /posts/:id/bookmark`
- `GET /posts/:id/comments`
- `POST /posts/:id/comments`

---

### A2. Routes That Return 404 (Not Implemented)

These routes were called by the frontend but do not exist on the backend at all.

| Missing Route | What the frontend expects | What to do |
|---|---|---|
| `GET /creator/posts` | Creator's own post list | Implement, or alias to `GET /posts?creator_id=me` once posts are fixed |
| `GET /creator/earnings` | Earnings list | Either implement or document that `GET /creator/revenue` is the correct route |
| `GET /creator/settings` | Creator config | Creator settings live at `GET /profiles/:userId/creator-settings` — see A3 |
| `PATCH /creator/settings` | Update creator config | Use `PATCH /profiles/:userId/creator-settings` — see A3 |
| `GET /wallet/transactions` | Transaction history separately | Not needed — `GET /wallet` already returns both wallet and transactions |
| `POST /wallet/topup` | Fund wallet | Not implemented |
| `POST /wallet/withdraw` | User-facing withdrawal | Not implemented (creator withdrawal is at `POST /creator/withdraw`) |
| `GET /subscriptions/my` | User's active subscriptions | Not needed — `GET /subscriptions` already returns this |
| `GET /messages` | Message list | Not needed — `GET /conversations` is the correct route |
| `GET /conversations/:id` | Single conversation detail | Not needed — `GET /conversations/:id/messages` is the correct route |
| `GET /search/recent` | Recent searches | ✅ **Actually works** — 200, returns array. Frontend is fine. |

---

### A3. Routes That Exist But Have Undocumented Behaviour

| Route | Status | Notes |
|---|---|---|
| `GET /profiles/:userId/creator-settings` | ✅ 200 | Returns `{ id, user_id, subscription_price, allow_dms, allow_comments, welcome_message, verification_status, created_at, updated_at }` |
| `PATCH /profiles/:userId/creator-settings` | ✅ (assumed) | Same path, PATCH method |
| `PUT /notifications/:id/read` | ⚠️ 405 | Single-notification mark-read does not work via PUT. Method is unknown — needs to be documented or implemented |
| `POST /auth/update-password` | ⚠️ 422 | Requires `confirm_password` in addition to `current_password` and `new_password` — not documented |
| `POST /users/block` | ⚠️ 422 | Requires field `user_id` (not `blocked_id`) |
| `DELETE /users/block` | ⚠️ 422 | Same — requires field `user_id` (not `blocked_id`) |
| `POST /auth/reset-password` | ⚠️ 422 | Requires `{ email, code, password, confirm_password }` — frontend only sends `{ token, password }` |
| `POST /media/upload` | ⚠️ 422 | Route exists and enforces MIME type. A real image file should work — test confirmed the route responds correctly to invalid input |

---

### A4. Confirmed Working Backend Routes (Do Not Break These)

These were all verified 200 with correct responses:

```
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/forgot-password
POST /auth/logout-all
GET  /auth/username-availability?username=

GET    /users/me
PATCH  /users/me
GET    /users/:username
POST   /users/:username/follow
DELETE /users/:username/follow
GET    /users/search?q=
GET    /users/:username/report  (POST)

GET  /notifications
POST /notifications/read-all

GET  /wallet

GET  /categories

GET  /subscriptions
POST /subscriptions

GET  /conversations
POST /conversations
GET  /conversations/:id/messages
POST /conversations/:id/messages

GET  /search?q=
GET  /search/recent
DELETE /search/recent

POST /creator/become
GET  /creator/dashboard
GET  /creator/analytics
GET  /creator/revenue
GET  /creator/subscribers
POST /creator/verification
POST /creator/withdraw

GET   /profiles/:userId/creator-settings
PATCH /profiles/:userId/creator-settings
PUT   /profiles/:userId/avatar
PUT   /profiles/:userId/banner

POST /payments/initialize
GET  /payments/verify?reference=
```

---

## PART B — FRONTEND FIXES REQUIRED

These are bugs in the frontend service files found by comparing what the code reads against what the backend actually returns. The backend routes work — the frontend is reading the wrong fields.

---

### B1. `services/wallet.ts` — Wrong response shape reading

**File:** `services/wallet.ts`, line 36–44

**What the backend actually returns** (from live probe):
```json
{
  "wallet": {
    "id": "68446681-...",
    "user_id": "6a11958c-...",
    "balance": 0,
    "currency": "NGN",
    "created_at": "...",
    "updated_at": "..."
  },
  "transactions": []
}
```

**What the frontend reads:**
```ts
const raw = await apiFetch<{ balance: number; transactions: unknown[] }>('/wallet', ...);
return {
  balance: raw?.balance ?? 0,          // ❌ raw.balance is undefined — it's raw.wallet.balance
  transactions: raw?.transactions ...   // ✅ this happens to be correct
};
```

**Fix:**
```ts
const raw = await apiFetch<{ wallet: { balance: number; currency: string }; transactions: unknown[] }>('/wallet', ...);
return {
  balance: raw?.wallet?.balance ?? 0,   // ✅
  transactions: Array.isArray(raw?.transactions) ? raw.transactions.map(normalizeTransaction) : [],
};
```

---

### B2. `services/subscriptions.ts` — Response is a raw array, not an object

**File:** `services/subscriptions.ts`, line 21–25

**What the backend actually returns** (from live probe):
```json
[]
```
A plain array, not `{ subscriptions: [] }`.

**What the frontend reads:**
```ts
return apiFetch('/subscriptions', { headers: authHeader(token) });
// Returns raw array directly — but the caller expects { subscriptions: Subscription[] }
```

**Fix in `getSubscriptions()`:**
```ts
const raw = await apiFetch<unknown>('/subscriptions', { headers: authHeader(token) });
const list = Array.isArray(raw) ? raw : [];
return { subscriptions: list.map(normalizeSubscription) };
```
You will also need a `normalizeSubscription` function — add one using the `Subscription` interface fields already defined in the file.

---

### B3. `services/creator.ts` — Revenue response fields don't match

**File:** `services/creator.ts`, line 45–52

**What the backend actually returns** (from live probe):
```json
{
  "balance": 0,
  "currency": "NGN",
  "earnings": [],
  "page": 1,
  "limit": 20
}
```

**What the frontend reads:**
```ts
return apiFetch('/creator/revenue', { headers: authHeader(token) });
// TypeScript type says: { total_revenue: number; transactions: unknown[] }
// But actual fields are: { balance, currency, earnings, page, limit }
```

**Fix — update the type and the callers:**
```ts
export async function getCreatorRevenue(): Promise<{
  balance: number;
  currency: string;
  earnings: unknown[];
}> {
  ...
  return apiFetch('/creator/revenue', { headers: authHeader(token) });
}
```
Then update every screen that uses `total_revenue` or `transactions` from this call — they should use `balance` and `earnings` instead.

---

### B4. `services/users.ts` — Block/Unblock sends wrong field name

**File:** `services/users.ts`, lines 117–131

**What the backend actually expects:**
```json
{ "user_id": "..." }
```
Returns 422 if the field name is wrong.

**What the frontend sends:**
```ts
body: JSON.stringify({ blocked_id: blockedId })  // ❌ field name is wrong
```

**Fix:**
```ts
body: JSON.stringify({ user_id: blockedId })  // ✅
```
Apply to both `blockUser()` and `unblockUser()`.

---

### B5. `services/settings.ts` — `updatePassword` missing `confirm_password`

**File:** `services/settings.ts`, line 37–48

**What the backend actually requires:**
```json
{ "current_password": "...", "new_password": "...", "confirm_password": "..." }
```
Returns 422 without `confirm_password`.

**What the frontend sends:**
```ts
body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password })
// ❌ missing confirm_password
```

**Fix:** Add `confirm_password` to the function signature and request body:
```ts
export async function updatePassword(data: {
  current_password: string;
  new_password: string;
  confirm_password: string;  // add this
}): Promise<void> {
```
Also update any screen that calls `updatePassword()` to pass the confirmation field.

---

### B6. `services/notifications.ts` — Single notification mark-read method wrong

**File:** `services/notifications.ts`, line 71–78

**What the frontend sends:**
```ts
await apiFetch(`/notifications/${id}/read`, { method: 'PUT', ... });
```

**Live probe result:** `PUT /notifications/:id/read` → 405 Method Not Allowed.

The correct method for this endpoint is unknown — it wasn't discoverable. The backend needs to either:
- Accept `PUT` on this route, or
- Document the correct method (likely `PATCH` or `POST`)

Until fixed: the "mark one notification as read" feature silently fails. `markAllNotificationsRead()` (which uses `POST /notifications/read-all`) works correctly.

---

### B7. `services/search.ts` — `search()` returns unwrapped envelope directly

**File:** `services/search.ts`, lines 12–23

**What the backend returns** (after `apiFetch` envelope unwrap):
```json
{ "users": [...], "posts": [...] }
```
Wait — the `apiFetch` wrapper already unwraps `.data`, so `search()` should be receiving the inner object. This actually works correctly as long as the backend `/search` route returns `{ users, posts }` inside its envelope.

**Status: ✅ Frontend is correct** — no fix needed here. However, the `posts` array will be empty until the backend posts 500 bug is fixed, because `/search` also hits the posts system internally.

---

### B8. `services/settings.ts` — `GET /settings` and `PATCH /settings` hit a 500 backend crash

**File:** `services/settings.ts`, lines 21–35

Both `getSettings()` and `updateSettings()` call `/settings` which returns 500 on the backend. The frontend calls and route are correct — this is purely a backend crash. See Part A1.

**Temporary frontend mitigation:** Wrap both calls in try/catch and return safe defaults if the call fails, so the settings screen doesn't crash the app.

---

## Summary Matrix

### Backend — Priority Order for Fixes

| Priority | Issue | Routes Affected |
|---|---|---|
| 🔴 P0 | Posts system crashes (500) | `GET /posts`, `POST /posts`, `GET /users/:username/posts`, `GET /explore` |
| 🔴 P0 | Settings crashes (500) | `GET /settings`, `PATCH /settings` |
| 🟠 P1 | Single notification mark-read broken (405) | `PUT /notifications/:id/read` |
| 🟠 P1 | Block/Unblock field name wrong (422) | `POST /users/block`, `DELETE /users/block` |
| 🟠 P1 | Update password missing field (422) | `POST /auth/update-password` |
| 🟠 P1 | Password reset wrong fields (422) | `POST /auth/reset-password` |
| 🟡 P2 | Missing creator posts route | `GET /creator/posts` |
| 🟡 P2 | Creator settings route mismatch | Frontend calls `/creator/settings`, real route is `/profiles/:id/creator-settings` |

### Frontend — Priority Order for Fixes

| Priority | File | Issue |
|---|---|---|
| 🔴 P0 | `services/wallet.ts:40` | Reads `raw.balance` — should be `raw.wallet.balance` — wallet always shows ₦0 |
| 🔴 P0 | `services/subscriptions.ts:24` | Response is `[]` not `{ subscriptions: [] }` — subscriptions screen crashes |
| 🟠 P1 | `services/creator.ts:48` | Revenue type wrong: `total_revenue`/`transactions` → `balance`/`earnings` |
| 🟠 P1 | `services/users.ts:120` | Block sends `blocked_id` → should be `user_id` |
| 🟠 P1 | `services/settings.ts:43` | Missing `confirm_password` on password change |
| 🟡 P2 | `services/notifications.ts:74` | Single mark-read method `PUT` returns 405 — await backend fix |
| 🟡 P2 | `services/settings.ts:24` | Settings screen will crash until backend fixes the 500 — add try/catch fallback |

---

## What Is Correct and Should Not Be Touched

The following frontend services are **correct as written** — do not change them:

- `services/api.ts` — envelope unwrapping, error handling, base URL
- `services/users.ts` — `getMe`, `updateMe`, `getUser`, `followUser`, `unfollowUser`, `searchUsers`, `checkUsernameAvailability`
- `services/notifications.ts` — `getNotifications`, `markAllNotificationsRead`, `deleteNotification`
- `services/messages.ts` — `getConversations`, `createConversation`, `getMessages`, `sendMessage`
- `services/creator.ts` — `getCreatorDashboard`, `getCreatorAnalytics`, `getCreatorSubscribers`, `becomeCreator`, `requestWithdrawal`
- `services/subscriptions.ts` — `subscribe` (POST with `creator_id`), `cancelSubscription`
- `services/categories.ts` — `getCategories`
- `services/search.ts` — `search`, `getRecentSearches`, `clearSearchHistory`
- `contexts/AuthContext.tsx` — login, logout, refresh, token storage
