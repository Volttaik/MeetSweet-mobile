# MeetSweet — Backend Implementation Required

Generated: 2026-07-25

This document describes every backend endpoint the frontend is already wired to use but that returns 404 or is not yet implemented on the server. The frontend handles each gracefully (empty state / toast) until the backend catches up.

---

## 1. User Search

**Feature:** Search modal (MsSearchModal), new-message modal  
**Endpoint:** `GET /api/users/search`  
**Method:** GET  
**Auth:** Bearer token required  
**Query params:**
```
?q=<string>     – search term (username, display name)
&limit=20       – results per page
&page=1         – pagination
```
**Response:**
```json
{
  "ok": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "string",
        "name": "string",
        "avatar_url": "string|null",
        "is_verified": false,
        "is_creator": false,
        "follower_count": 0
      }
    ],
    "total": 0,
    "page": 1
  }
}
```
**Database:** SELECT from `users` WHERE username ILIKE or name ILIKE  
**Security:** Rate-limit to 30 req/min per user. Never return email or phone in search results.  
**How frontend uses it:** `services/messages.ts searchUsers()` + `MsSearchModal` as fallback for creator search.

---

## 2. Public Creator Profile

**Feature:** Creator profile screen (`app/creator/[id].tsx`), follow/unfollow  
**Endpoint:** `GET /api/users/:username`  
**Method:** GET  
**Auth:** Optional (public profile); token injects `is_following` for authenticated users  
**Response:**
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "name": "string",
      "bio": "string|null",
      "avatar_url": "string|null",
      "banner_url": "string|null",
      "is_verified": false,
      "is_creator": false,
      "follower_count": 0,
      "following_count": 0,
      "subscriber_count": 0,
      "post_count": 0
    },
    "is_following": false
  }
}
```
**Database:** SELECT from `users` JOIN follower table for `is_following`  
**Security:** If account is private and user is not a follower, hide posts but return profile card.

---

## 3. Follow / Unfollow User

**Feature:** Creator profile follow button  
**Endpoint:** `POST /api/users/:username/follow` (follow), `DELETE /api/users/:username/follow` (unfollow)  
**Method:** POST / DELETE  
**Auth:** Bearer token required  
**Request body:** None  
**Response:**
```json
{ "ok": true, "data": { "following": true } }
```
**Database:** `followers` table: (follower_id, following_id, created_at)  
**Security:** Cannot follow yourself. Blocked users cannot be followed.

---

## 4. Conversations (Messaging)

### 4a. List conversations
**Endpoint:** `GET /api/conversations`  
**Query:** `?filter=all|archived|unread`  
**Response:**
```json
{
  "ok": true,
  "data": {
    "conversations": [{
      "id": "uuid",
      "other_user": { "id": "uuid", "username": "string", "name": "string", "avatar_url": null },
      "last_message": { "body": "string", "created_at": "ISO", "is_own": false },
      "unread_count": 0,
      "is_archived": false
    }]
  }
}
```

### 4b. Create conversation
**Endpoint:** `POST /api/conversations`  
**Body:** `{ "user_id": "uuid" }`  
**Response:** `{ "ok": true, "data": { "conversation": { "id": "uuid" } } }`

### 4c. Get messages
**Endpoint:** `GET /api/conversations/:id/messages`  
**Query:** `?before=<message_id>&limit=30`  
**Response:**
```json
{
  "ok": true,
  "data": {
    "messages": [{
      "id": "uuid",
      "body": "string|null",
      "media_url": "string|null",
      "media_type": "image|video|voice|null",
      "is_deleted": false,
      "reply_to_id": "uuid|null",
      "created_at": "ISO",
      "sender": { "id": "uuid", "username": "string", "name": "string", "avatar_url": null }
    }],
    "has_more": false
  }
}
```

### 4d. Send message
**Endpoint:** `POST /api/conversations/:id/messages`  
**Body:** `{ "body": "string", "media_url": "string|null", "media_type": "string|null", "reply_to_id": "uuid|null" }`

### 4e. Archive conversation
**Endpoint:** `PUT /api/conversations/:id/archive`  
**Body:** `{ "archived": true }`

**Database tables:**
- `conversations` (id, created_at)
- `conversation_participants` (conversation_id, user_id)
- `messages` (id, conversation_id, sender_id, body, media_url, media_type, reply_to_id, is_deleted, created_at)

**Security:** Users can only read conversations they participate in. Rate-limit message sending.

---

## 5. Profile Update (PATCH /users/me)

**Feature:** Edit Profile screen, Privacy Settings, all profile fields  
**Endpoint:** `PATCH /api/users/me`  
**Method:** PATCH  
**Auth:** Bearer token required  
**Request body (all fields optional):**
```json
{
  "name": "string",
  "bio": "string|null",
  "username": "string",
  "website": "string|null",
  "location": "string|null",
  "birthday": "YYYY-MM-DD|null",
  "gender": "male|female|nonbinary|prefer_not_to_say|null",
  "avatar_url": "string|null",
  "banner_url": "string|null"
}
```
**Validation:** Username must be unique, 3–30 chars, alphanumeric + underscores.  
**Response:** `{ "ok": true, "data": { "user": { ...updatedUser } } }`  
**Current status:** GET works; PATCH returns 405 (method not allowed — handler not registered).  
**Fix:** Register PATCH handler on the `/api/users/me` route.

---

## 6. Comment Edit / Delete

**Feature:** Post detail screen comment management  
**Endpoint:** `PATCH /api/posts/:id/comments/:commentId` (edit), `DELETE /api/posts/:id/comments/:commentId` (delete)  
**Auth:** Bearer token required  
**Edit body:** `{ "body": "string" }`  
**Delete:** No body  
**Database:** UPDATE/DELETE in `comments` table; only comment owner or post owner can delete.

---

## 7. Comment Likes

**Feature:** Comment like button in post detail  
**Endpoint:** `POST /api/posts/:id/comments/:commentId/like` (like), `DELETE /api/posts/:id/comments/:commentId/like` (unlike)  
**Auth:** Bearer token required  
**Response:** `{ "ok": true, "data": { "liked": true, "like_count": 1 } }`

---

## 8. Mark Single Notification Read

**Feature:** Notification screen — mark individual notification as read  
**Endpoint:** `PUT /api/notifications/:id/read`  
**Method:** PUT  
**Auth:** Bearer token required  
**Response:** `{ "ok": true }`

---

## 9. Change Password

**Feature:** Security Settings screen — Change Password  
**Endpoint:** `POST /api/auth/change-password`  
**Method:** POST  
**Auth:** Bearer token required  
**Body:** `{ "currentPassword": "string", "newPassword": "string" }`  
**Validation:** currentPassword must match stored hash. newPassword min 8 chars.  
**Response:** `{ "ok": true }`  
**Security:** Invalidate all refresh tokens on success (force re-login on other devices).

---

## 10. Sign Out All Devices

**Feature:** Security Settings — Sign Out All Other Devices  
**Endpoint:** `POST /api/auth/logout-all`  
**Method:** POST  
**Auth:** Bearer token required  
**Response:** `{ "ok": true }`  
**Action:** Invalidate all refresh tokens for the user except the current one.

---

## 11. Creator Withdrawal

**Feature:** Creator Payout screen — Withdraw Funds  
**Endpoint:** `POST /api/creator/withdraw`  
**Method:** POST  
**Auth:** Bearer token + is_creator check  
**Body:**
```json
{
  "amount": 50.00,
  "payment_method_id": "uuid"
}
```
**Validation:** amount >= minimum_withdrawal (configurable, default $20). User must have sufficient balance.  
**Response:** `{ "ok": true, "data": { "withdrawal": { "id": "uuid", "amount": 50.00, "status": "pending", "created_at": "ISO" } } }`  
**Database:** `withdrawals` table (id, creator_id, amount, status, payment_method_id, created_at, processed_at)

---

## 12. Creator Analytics

**Feature:** Creator Dashboard — revenue, subscribers, views  
**Endpoint:** `GET /api/creator/analytics`  
**Method:** GET  
**Auth:** Bearer token + is_creator check  
**Query:** `?period=daily|weekly|monthly`  
**Response:**
```json
{
  "ok": true,
  "data": {
    "revenue": { "daily": 0, "weekly": 0, "monthly": 0, "pending": 0 },
    "views": { "daily": 0, "weekly": 0, "monthly": 0 },
    "subscribers": { "total": 0, "new_this_week": 0 },
    "top_posts": [{ "id": "uuid", "caption": "string", "view_count": 0, "revenue": 0 }]
  }
}
```
**Database:** Aggregation queries on `posts`, `subscriptions`, `transactions` tables.

---

## 13. Creator Subscription Plans

**Feature:** Creator plans / membership pricing  
**Endpoint:** `GET /api/creator/:id/plans`, `POST /api/creator/plans` (create/update own plan)  
**Auth:** GET is public; POST requires is_creator  
**Response (GET):**
```json
{
  "ok": true,
  "data": {
    "plans": [{
      "id": "uuid",
      "name": "Starter",
      "price": 0,
      "features": ["string"],
      "is_current": false
    }]
  }
}
```

---

## 14. Payment Methods

**Feature:** Creator Payout — connect bank / PayPal  
**Endpoint:** `GET /api/payment-methods`, `POST /api/payment-methods`, `DELETE /api/payment-methods/:id`  
**Auth:** Bearer token required  
**Body (POST):**
```json
{
  "type": "bank|paypal",
  "details": { ... }
}
```
**Security:** Never store raw card/bank numbers. Use Stripe Connect or similar third-party for PII.

---

## 15. Linked OAuth Accounts

**Feature:** Settings → Linked Accounts (Google, Apple, GitHub, X, Facebook)  
**Endpoint:** `GET /api/auth/linked-accounts`, `DELETE /api/auth/linked-accounts/:provider`  
**Auth:** Bearer token required  
**Response (GET):**
```json
{
  "ok": true,
  "data": {
    "accounts": [{ "provider": "google", "email": "user@gmail.com", "linked_at": "ISO" }]
  }
}
```

---

## Summary

| Priority | Feature | Endpoint | Complexity |
|---|---|---|---|
| P0 | Profile update | `PATCH /users/me` | Low — add PATCH handler |
| P0 | Conversations | `GET/POST /conversations/*` | High |
| P0 | Change password | `POST /auth/change-password` | Low |
| P1 | User search | `GET /users/search` | Medium |
| P1 | Creator profile | `GET /users/:username` | Medium |
| P1 | Follow/unfollow | `POST/DELETE /users/:username/follow` | Medium |
| P1 | Creator analytics | `GET /creator/analytics` | High |
| P2 | Comment CRUD | `PATCH/DELETE /posts/:id/comments/:id` | Medium |
| P2 | Withdrawal | `POST /creator/withdraw` | Medium |
| P2 | Payment methods | `GET/POST /payment-methods` | High |
| P3 | Linked accounts | `GET /auth/linked-accounts` | Medium |
| P3 | Sign out all | `POST /auth/logout-all` | Low |

---

## (Settings phase) New missing endpoints

### Username change
**Endpoint:** `GET /api/users/:username` (availability check)  
**Method:** GET  
**Auth:** Bearer token  
**Purpose:** Live availability check as user types new username  
**Response:** `{ "ok": true, "data": { "available": true } }`

### Username update
**Endpoint:** `PATCH /api/users/me`  
**Field:** `username`  
**Notes:** Already documented above — PATCH /users/me also needs to accept `username` field with uniqueness validation.

### Email change
**Endpoint:** `POST /api/auth/change-email`  
**Method:** POST  
**Auth:** Bearer token  
**Body:** `{ "email": "new@example.com" }`  
**Response:** `{ "ok": true, "data": { "message": "Verification email sent" } }`  
**Notes:** Should send verification to new address; old email stays until verified.

### Phone number update & OTP
**Endpoint:** `POST /api/auth/phone/request-otp`  
**Method:** POST  
**Auth:** Bearer token  
**Body:** `{ "phone": "+1234567890" }`  
**Notes:** Sends OTP to the number.

**Endpoint:** `POST /api/auth/phone/verify-otp`  
**Method:** POST  
**Auth:** Bearer token  
**Body:** `{ "phone": "+1234567890", "otp": "123456" }`

### Biometric registration
**Endpoint:** `POST /api/auth/biometric/register`  
**Method:** POST  
**Auth:** Bearer token  
**Notes:** Stores device biometric credential server-side. Frontend also requires `expo-local-authentication` package for native fingerprint/Face ID prompt.

### Username availability (standalone)
**Endpoint:** `GET /api/users/check-username?username=<value>`  
**Method:** GET  
**Auth:** Bearer token  
**Response:** `{ "ok": true, "data": { "available": true } }`
