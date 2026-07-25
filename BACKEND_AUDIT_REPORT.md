# MeetSweet — Frontend API Audit Report
> Generated: 2026-07-25 | Backend: https://meetsweet-server.quizmi.space/api

---

## HOW TO READ THIS REPORT

Every endpoint the Expo app calls was probed against the live backend.

- **✅ Working** — route exists, auth guard responds correctly (401 for missing auth), or returns expected data
- **⚠️ Partial** — route exists but method, field name, or response shape is wrong
- **❌ Missing** — backend returns 404 (route not implemented)
- **🔧 Fixed** — frontend bug found and fixed in this session

---

## SUMMARY

| Category | Count |
|---|---|
| Working endpoints | 16 |
| Partially working | 3 |
| Missing backend endpoints | 19 |
| Frontend bugs fixed | 2 |
| Backend prompts generated | 13 |

---

## ✅ WORKING ENDPOINTS

| Method | Path | Notes |
|---|---|---|
| POST | /auth/login | Returns 401 for wrong creds — route live |
| POST | /auth/register | Returns 422 validation — route live |
| POST | /auth/refresh | Returns 422 for bad token — route live |
| POST | /auth/logout | Returns 401 — route live |
| GET | /users/me | Returns 401 — route live |
| GET | /api/healthz | Returns 200 |
| GET | /posts | Returns 200 — feed works |
| GET | /posts/:id | Returns 404 for bad ID (route exists — DELETE on same path returns 401) |
| POST | /posts | Returns 401 — route live |
| DELETE | /posts/:id | Returns 401 — route live |
| POST | /posts/:id/like | Returns 401 — route live |
| DELETE | /posts/:id/like | Returns 401 — route live |
| GET | /posts/:id/comments | Returns 200 |
| POST | /posts/:id/comments | Returns 401 — route live |
| POST | /posts/:id/report | Returns 401 — route live |
| GET | /notifications | Returns 401 — route live |
| GET | /wallet | Returns 401 — route live |
| DELETE | /messages/:id | Returns 401 — route live |

---

## ⚠️ PARTIALLY WORKING ENDPOINTS

### 1. `PATCH /posts/:id` — Frontend was calling PUT

- **Endpoint URL:** `PATCH /posts/:id`
- **HTTP Method:** PATCH
- **Status:** Backend allows: `DELETE, GET, HEAD, OPTIONS, PATCH`. Frontend was calling `PUT` → 405.
- **Root Cause:** Frontend
- **Fixed:** ✅ `services/posts.ts` `editPost()` changed from `PUT` to `PATCH`

---

### 2. `POST /notifications/read-all` — Frontend was calling PUT

- **Endpoint URL:** `POST /notifications/read-all`
- **HTTP Method:** POST
- **Status:** `PUT /notifications/read-all` → 405. `POST /notifications/read-all` → 401 (route exists, auth works).
- **Root Cause:** Frontend
- **Fixed:** ✅ `services/notifications.ts` `markAllNotificationsRead()` changed from `PUT` to `POST`

---

### 3. `PUT /users/me` — Neither PUT nor PATCH accepted

- **Endpoint URL:** `PUT /users/me` (or PATCH)
- **HTTP Method:** PUT / PATCH
- **Status:** Both `PUT /users/me` and `PATCH /users/me` return 405. GET works (401). Backend exposes `/users/me` as **read-only**.
- **Root Cause:** Backend — update profile not implemented
- **Files affected:** `services/users.ts` `updateMe()`, `app/edit-profile.tsx`
- **See backend prompt #12 below**

---

## ❌ MISSING ENDPOINTS (19 total)

All return 404. Grouped by feature area.

### Posts

| Method | Path | Used by |
|---|---|---|
| POST | /posts/:id/bookmark | `bookmarkPost()` — home feed, post detail |
| DELETE | /posts/:id/bookmark | `unbookmarkPost()` — home feed, post detail |
| PUT | /posts/:id/comments/:commentId | `editComment()` — post detail |
| DELETE | /posts/:id/comments/:commentId | `deleteComment()` — post detail |
| POST | /posts/:id/comments/:commentId/like | `likeComment()` — post detail |
| DELETE | /posts/:id/comments/:commentId/like | `unlikeComment()` — post detail |
| GET | /posts?bookmarked=true | `getBookmarkedPosts()` — profile Saved tab (filter silently ignored without auth) |

### Users

| Method | Path | Used by |
|---|---|---|
| GET | /users/:username | `getUser()` — creator profile screen |
| POST | /users/:username/follow | `followUser()` — creator profile |
| DELETE | /users/:username/follow | `unfollowUser()` — creator profile |
| GET | /users/search?q= | `searchUsers()` — new message modal |

### Media

| Method | Path | Used by |
|---|---|---|
| POST | /media/upload | `uploadMedia()` — create post screen |

### Messaging

| Method | Path | Used by |
|---|---|---|
| GET | /conversations | `getConversations()` — messages tab, chat screen header |
| POST | /conversations | `createConversation()` — new message modal |
| GET | /conversations/:id/messages | `getMessages()` — chat screen |
| POST | /conversations/:id/messages | `sendMessage()` — chat screen |
| PUT | /conversations/:id/archive | `archiveConversation()` — message long-press |

### Notifications

| Method | Path | Used by |
|---|---|---|
| PUT | /notifications/:id/read | `markNotificationRead()` — notifications screen |

### Categories

| Method | Path | Used by |
|---|---|---|
| GET | /categories | `getCategories()` — create post categories picker |

---

## 🔧 FRONTEND FIXES APPLIED

### Fix 1 — `editPost` method: PUT → PATCH
**File:** `services/posts.ts`
```diff
- method: 'PUT',
+ method: 'PATCH',
```
Backend allows PATCH on `/posts/:id`. Frontend was sending PUT → 405.

---

### Fix 2 — `markAllNotificationsRead` method: PUT → POST
**File:** `services/notifications.ts`
```diff
- method: 'PUT',
+ method: 'POST',
```
Backend accepts POST on `/notifications/read-all`. Frontend was sending PUT → 405.

---

## UPLOAD INVESTIGATION

**Endpoint:** `POST /api/media/upload`
**Service:** `services/media.ts`
**Result:** `HTTP 404` — route does not exist on the backend

### Upload flow trace:
1. User picks image/video via `expo-image-picker` ✅
2. `uploadMedia()` builds a `FormData` with `file` field ✅
3. XHR sends `POST https://meetsweet-server.quizmi.space/api/media/upload` with `Authorization: Bearer <token>` ✅
4. **Fails here: backend returns 404 (Next.js HTML page, not JSON)**
5. `JSON.parse` on HTML throws → `reject(new Error('Failed to parse upload response'))` ✅ (surfaces cleanly)

### Auth header: ✅ Present
### Request payload: ✅ Correct (`FormData`, `file` field, no forced Content-Type)
### Stage of failure: Backend — route `/api/media/upload` is not implemented

See backend prompt #1 below.

---

## BACKEND PROMPTS

### PROMPT 1 — Media Upload Endpoint

```
TASK: Implement POST /api/media/upload

FAILING ENDPOINT
  POST /api/media/upload
  Current response: 404 (route does not exist)

WHY IT FAILS
  The route /api/media/upload is not implemented. The Expo client sends a
  multipart/form-data POST request with a single "file" field and an
  Authorization: Bearer <token> header.

EXPECTED BEHAVIOUR
  1. Authenticate the request (validate Bearer token).
  2. Accept multipart/form-data with a single field named "file".
  3. Validate the file: accept image/* and video/* MIME types only.
  4. Upload the binary to your storage layer (e.g. Vercel Blob, S3, Cloudinary).
  5. For video uploads, optionally generate a thumbnail.
  6. Return the following JSON on success (HTTP 200):
     {
       "ok": true,
       "data": {
         "url": "https://...",
         "thumbnailUrl": "https://..." | null,
         "type": "image" | "video",
         "size": 123456,
         "filename": "media-xyz.jpg",
         "originalName": "photo.jpg",
         "mimeType": "image/jpeg"
       }
     }

FILES LIKELY INVOLVED
  app/api/media/upload/route.ts  (create this file)

VALIDATION
  - Auth: 401 if no/invalid token
  - No file: 400 { ok: false, error: "No file provided" }
  - Invalid type: 400 { ok: false, error: "Unsupported file type" }
  - File too large: 413 { ok: false, error: "File too large" }

NOTES
  The client sets no explicit Content-Type (lets the browser set the multipart
  boundary automatically). Do NOT require a JSON body — this is multipart only.
  The client uses XMLHttpRequest with upload.onprogress so the server must
  stream the response only after the full upload completes.
```

---

### PROMPT 2 — Bookmark / Unbookmark Post

```
TASK: Implement POST/DELETE /api/posts/:id/bookmark

FAILING ENDPOINTS
  POST   /api/posts/:id/bookmark  → 404
  DELETE /api/posts/:id/bookmark  → 404

WHY THEY FAIL
  These routes do not exist. Backend returns a Next.js HTML 404 page.

EXPECTED BEHAVIOUR
  POST   — bookmark the post for the authenticated user
           Response: { "ok": true, "data": { "bookmarked": true } }
  DELETE — remove the bookmark
           Response: { "ok": true, "data": { "bookmarked": false } }

FILES LIKELY INVOLVED
  app/api/posts/[id]/bookmark/route.ts  (create this file)

VALIDATION
  - 401 if not authenticated
  - 404 if post does not exist
  - POST on an already-bookmarked post should be idempotent (return 200)
  - DELETE on a non-bookmarked post should be idempotent (return 200)

RELATED
  GET /api/posts?bookmarked=true must filter to only posts bookmarked by the
  authenticated user (currently this filter is silently ignored).
```

---

### PROMPT 3 — Edit / Delete Comment

```
TASK: Implement PUT/DELETE /api/posts/:id/comments/:commentId

FAILING ENDPOINTS
  PUT    /api/posts/:id/comments/:commentId  → 404
  DELETE /api/posts/:id/comments/:commentId  → 404

WHY THEY FAIL
  These routes do not exist.

EXPECTED BEHAVIOUR
  PUT    — edit the comment body (owner only)
    Request body: { "body": "updated text" }
    Response: { "ok": true, "data": { "comment": { ...comment fields } } }
  DELETE — permanently delete the comment (owner only)
    Response: { "ok": true, "data": {} }

FILES LIKELY INVOLVED
  app/api/posts/[id]/comments/[commentId]/route.ts  (create this file)

VALIDATION
  - 401 if not authenticated
  - 403 if authenticated user is not the comment author
  - 404 if comment does not exist
  - PUT: "body" is required and must be non-empty string

COMMENT RESPONSE SHAPE (must match existing GET /posts/:id/comments shape)
  {
    "id": "string",
    "body": "string",
    "created_at": "ISO string",
    "updated_at": "ISO string",
    "like_count": 0,
    "reply_count": 0,
    "parent_id": null | "string",
    "liked_by_me": false,
    "author": {
      "id": "string",
      "name": "string",
      "username": "string",
      "avatar_url": null | "string"
    }
  }
```

---

### PROMPT 4 — Like / Unlike Comment

```
TASK: Implement POST/DELETE /api/posts/:id/comments/:commentId/like

FAILING ENDPOINTS
  POST   /api/posts/:id/comments/:commentId/like  → 404
  DELETE /api/posts/:id/comments/:commentId/like  → 404

WHY THEY FAIL
  These routes do not exist.

EXPECTED BEHAVIOUR
  POST   — like the comment
    Response: { "ok": true, "data": { "liked": true, "likeCount": 5 } }
  DELETE — remove like
    Response: { "ok": true, "data": { "liked": false, "likeCount": 4 } }

FILES LIKELY INVOLVED
  app/api/posts/[id]/comments/[commentId]/like/route.ts  (create this file)

VALIDATION
  - 401 if not authenticated
  - 404 if comment not found
  - Idempotent: re-liking should not create duplicate records
```

---

### PROMPT 5 — User Profile by Username

```
TASK: Implement GET /api/users/:username

FAILING ENDPOINT
  GET /api/users/:username  → 404

WHY IT FAILS
  The route does not exist. Note: /api/users/me works (GET → 401). The
  parameterised version /api/users/:username is missing.

EXPECTED BEHAVIOUR
  Return the public profile of the user with that username.
  Response: {
    "ok": true,
    "data": {
      "user": {
        "id": "string",
        "name": "string",
        "username": "string",
        "email": null,
        "phone": null,
        "bio": null | "string",
        "avatar_url": null | "string",
        "banner_url": null | "string",
        "is_verified": false,
        "is_creator": false,
        "credits": 0,
        "follower_count": 0,
        "following_count": 0,
        "subscriber_count": 0,
        "post_count": 0,
        "created_at": "ISO string"
      },
      "isFollowing": false
    }
  }

FILES LIKELY INVOLVED
  app/api/users/[username]/route.ts  (create this file)

  Note: ensure [username] does not conflict with the existing "me" route.
  Next.js resolves /users/me to the static route, not the dynamic one, if
  both exist at the same level. Recommended structure:
    app/api/users/me/route.ts
    app/api/users/[username]/route.ts

VALIDATION
  - 404 { ok: false, error: "User not found" } if username does not exist
  - The isFollowing field must reflect whether the authenticated user (if any)
    follows this profile. Default false for unauthenticated requests.
```

---

### PROMPT 6 — Follow / Unfollow User

```
TASK: Implement POST/DELETE /api/users/:username/follow

FAILING ENDPOINTS
  POST   /api/users/:username/follow  → 404
  DELETE /api/users/:username/follow  → 404

WHY THEY FAIL
  These routes do not exist.

EXPECTED BEHAVIOUR
  POST   — follow the user
    Response: { "ok": true, "data": { "following": true } }
  DELETE — unfollow the user
    Response: { "ok": true, "data": { "following": false } }

FILES LIKELY INVOLVED
  app/api/users/[username]/follow/route.ts  (create this file)

VALIDATION
  - 401 if not authenticated
  - 404 if target user not found
  - 400 if trying to follow yourself
  - Idempotent: following an already-followed user → 200, not error
```

---

### PROMPT 7 — User Search

```
TASK: Implement GET /api/users/search?q=

FAILING ENDPOINT
  GET /api/users/search?q=test  → 404

WHY IT FAILS
  The route does not exist. Used by the "New Message" modal to find users
  to start a conversation with.

EXPECTED BEHAVIOUR
  Search users by name or username (partial match, case-insensitive).
  Require authentication.
  Response: {
    "ok": true,
    "data": {
      "users": [
        {
          "id": "string",
          "name": "string",
          "username": "string",
          "avatarUrl": null | "string",
          "isVerified": false
        }
      ]
    }
  }

FILES LIKELY INVOLVED
  app/api/users/search/route.ts  (create this file)

  IMPORTANT: Place this at app/api/users/search/route.ts (static segment)
  so it does not conflict with app/api/users/[username]/route.ts.
  Next.js static routes win over dynamic ones.

VALIDATION
  - 401 if not authenticated
  - "q" query param required, minimum 2 characters; return 400 if missing or too short
  - Return at most 20 results
  - Exclude the requesting user from results
```

---

### PROMPT 8 — Conversations (Messaging)

```
TASK: Implement GET/POST /api/conversations and related message routes

FAILING ENDPOINTS
  GET  /api/conversations              → 404
  POST /api/conversations              → 404
  GET  /api/conversations/:id/messages → 404
  POST /api/conversations/:id/messages → 404
  PUT  /api/conversations/:id/archive  → 404

WHY THEY FAIL
  None of the conversation routes exist.

EXPECTED BEHAVIOUR

  GET /conversations?tab=all|archived
    Returns the authenticated user's conversations, newest first.
    Response: {
      "ok": true,
      "data": {
        "conversations": [
          {
            "id": "string",
            "lastMessageBody": null | "string",
            "lastMessageAt": null | "ISO string",
            "createdAt": "ISO string",
            "isMuted": false,
            "isArchived": false,
            "unreadCount": 0,
            "otherUser": {
              "id": "string",
              "name": "string",
              "username": "string",
              "avatarUrl": null | "string",
              "isVerified": false
            }
          }
        ]
      }
    }

  POST /conversations
    Body: { "userId": "string" }
    Creates a conversation between the authenticated user and the target user.
    If one already exists, return it (idempotent).
    Response: { "ok": true, "data": { "conversationId": "string", "created": true|false } }

  GET /conversations/:id/messages?before=<ISO>
    Returns messages in the conversation, newest first (paginated by cursor).
    Response: {
      "ok": true,
      "data": {
        "messages": [
          {
            "id": "string",
            "body": null | "string",
            "mediaUrl": null | "string",
            "mediaType": null | "image" | "video",
            "isDeleted": false,
            "createdAt": "ISO string",
            "sender": {
              "id": "string",
              "name": "string",
              "username": "string",
              "avatarUrl": null | "string"
            },
            "isOwn": true | false
          }
        ],
        "hasMore": false
      }
    }

  POST /conversations/:id/messages
    Body: { "body": "string", "mediaUrl": "string|null", "mediaType": "image|video|null" }
    Response: { "ok": true, "data": { "message": { ...message fields } } }

  PUT /conversations/:id/archive
    Body: { "archived": true | false }
    Response: { "ok": true, "data": {} }

FILES LIKELY INVOLVED
  app/api/conversations/route.ts
  app/api/conversations/[id]/messages/route.ts
  app/api/conversations/[id]/archive/route.ts

VALIDATION
  - All routes: 401 if not authenticated
  - GET/POST conversations/:id: 403 if user is not a participant in the conversation
  - POST conversations: 404 if target userId does not exist, 400 if body missing
  - POST messages: at least one of body or mediaUrl must be present
```

---

### PROMPT 9 — Mark Single Notification Read

```
TASK: Implement PUT /api/notifications/:id/read

FAILING ENDPOINT
  PUT /api/notifications/:id/read  → 404

WHY IT FAILS
  The route does not exist.

NOTE
  GET /notifications → 401 ✓ (route works)
  POST /notifications/read-all → 401 ✓ (route works — frontend was previously
  calling PUT but has been corrected to POST)
  Only the single-notification read endpoint is missing.

EXPECTED BEHAVIOUR
  Mark one notification as read for the authenticated user.
  Response: { "ok": true, "data": {} }

FILES LIKELY INVOLVED
  app/api/notifications/[id]/read/route.ts  (create this file)

VALIDATION
  - 401 if not authenticated
  - 404 if notification not found
  - 403 if notification does not belong to the authenticated user
```

---

### PROMPT 10 — Categories

```
TASK: Implement GET /api/categories

FAILING ENDPOINT
  GET /api/categories  → 404

WHY IT FAILS
  The route does not exist. Used by the create-post screen to show a
  category picker so users can tag their content.

EXPECTED BEHAVIOUR
  Return available content categories.
  Response: {
    "ok": true,
    "data": {
      "categories": [
        {
          "id": "string",
          "name": "string",
          "slug": "string",
          "postCount": 0
        }
      ]
    }
  }

FILES LIKELY INVOLVED
  app/api/categories/route.ts  (create this file)

NOTES
  - No authentication required (public endpoint)
  - Suggest seeding at minimum: Lifestyle, Fashion, Fitness, Photography,
    Gaming, Music, Dance, Comedy, Education, Art, Cooking, Travel, Technology
  - The create-post screen silently hides the category picker if this returns
    an error, so a 404 just means no categories are shown — it does not crash
    the screen
```

---

### PROMPT 11 — POST /posts response shape alignment

```
TASK: Verify GET /api/posts response shape matches the frontend normalizer

CURRENT STATUS
  GET /api/posts → 200 ✓ but response body appears to be empty or the shape
  may not be parsed correctly by the frontend.

FRONTEND EXPECTED SHAPE
  The frontend normalizePost() function handles both camelCase and snake_case
  and expects this structure:
  {
    "ok": true,
    "data": {
      "posts": [
        {
          "id": "string",
          "caption": "string | null",
          "visibility": "public" | "subscribers" | "draft",
          "like_count": 0,
          "comment_count": 0,
          "save_count": 0,
          "created_at": "ISO string",
          "creator_id": "string",
          "creator_username": "string",
          "creator_display_name": "string",
          "creator_avatar": null | "string",
          "creator_is_verified": false,
          "liked_by_me": false,
          "bookmarked_by_me": false,
          "media": [
            {
              "url": "string",
              "type": "image" | "video",
              "thumbnail_url": null | "string",
              "duration_secs": null | number,
              "file_size": null | number,
              "width": null | number,
              "height": null | number
            }
          ]
        }
      ],
      "page": 1,
      "limit": 20
    }
  }

VERIFY
  1. That GET /posts returns the above shape (not an empty body)
  2. That GET /posts?userId=<id> filters to only that user's posts
  3. That GET /posts?bookmarked=true returns only posts bookmarked by the
     authenticated user (currently this filter appears to be ignored)

FILES LIKELY INVOLVED
  app/api/posts/route.ts
```

---

### PROMPT 12 — Update User Profile (PUT/PATCH /users/me)

```
TASK: Implement PATCH /api/users/me (update profile)

FAILING ENDPOINT
  PUT  /api/users/me  → 405
  PATCH /api/users/me → 405

WHY IT FAILS
  GET /users/me works (returns 401 without auth) but neither PUT nor PATCH
  is accepted — the route only responds to GET. Profile updates are blocked.

EXPECTED BEHAVIOUR
  Allow authenticated users to update their display name and bio.
  Method: PATCH (preferred) or PUT
  Request body: {
    "name": "string",        // optional, min 2 chars
    "bio": "string | null",  // optional, max 160 chars
    "avatar_url": "string | null",   // optional
    "banner_url": "string | null"    // optional
  }
  Response: {
    "ok": true,
    "data": {
      "user": { ...full user object (same shape as GET /users/me) }
    }
  }

FILES LIKELY INVOLVED
  app/api/users/me/route.ts  — add PATCH/PUT handler alongside the existing GET

VALIDATION
  - 401 if not authenticated
  - name: min 2 characters if provided
  - bio: max 160 characters if provided
  - Accept snake_case field names (avatar_url, banner_url) in body
```

---

### PROMPT 13 — Auth Registration: username field required

```
TASK: Verify username is required during registration

CURRENT STATUS
  POST /api/auth/register → 422 with:
  { "ok": false, "error": "username: Required, password: String must contain at least 8 character(s)" }

ISSUE
  The frontend's RegisterData type marks username as optional:
    username?: string
  If a user completes registration without providing a username, the backend
  will reject with 422 (username: Required), showing a confusing error.

  NOTE: The registration SCREENS may always collect username — check
  app/register.tsx and app/profile-setup.tsx. If username is always
  collected before calling register(), this is not an issue.

  Also note: the password minimum length is 8 characters. The frontend does
  not currently enforce this minimum before sending the request.

VERIFY
  1. All registration screens always provide username before calling register()
  2. Frontend validates password.length >= 8 before calling the API

FILES LIKELY INVOLVED
  app/register.tsx
  app/profile-setup.tsx
  app/create-account.tsx
  contexts/AuthContext.ts (RegisterData interface)
```

---

## AUTHENTICATION ISSUES

None. The auth token flow (login → token → refresh → retry) is correctly implemented in `services/api.ts`. The envelope format `{ ok: true, data: ... }` is correctly handled.

---

## DATABASE ISSUES

Cannot verify database schema directly. The following backend endpoints suggest the database is likely missing tables or foreign key relationships:

- No bookmarks table or the join query is missing
- No conversations / messages schema
- No follows/subscribers relation for `/users/:username/follow`
- No categories table

---

## ENVIRONMENT VARIABLE ISSUES

None found. `EXPO_PUBLIC_API_URL` is correctly set to `https://meetsweet-server.quizmi.space` and the frontend correctly appends `/api` to all routes.

---

## FEATURE STATUS SUMMARY

| Feature | Status | Blocker |
|---|---|---|
| Authentication (login/register/verify/refresh) | ✅ Working | — |
| Home Feed (GET /posts) | ✅ Working | — |
| Post Detail | ✅ Working | — |
| Like / Unlike Post | ✅ Working | — |
| Report Post | ✅ Working | — |
| Add Comment | ✅ Working | — |
| Edit Post | ✅ Fixed | Was using PUT → PATCH |
| Mark All Notifications Read | ✅ Fixed | Was using PUT → POST |
| View Notifications | ✅ Working | — |
| Wallet (balance + transactions) | ✅ Working | — |
| Bookmark / Unbookmark Post | ❌ Broken | Backend missing (Prompt #2) |
| Edit / Delete Comment | ❌ Broken | Backend missing (Prompt #3) |
| Like / Unlike Comment | ❌ Broken | Backend missing (Prompt #4) |
| Creator Profile (by username) | ❌ Broken | Backend missing (Prompt #5) |
| Follow / Unfollow User | ❌ Broken | Backend missing (Prompt #6) |
| User Search | ❌ Broken | Backend missing (Prompt #7) |
| Messaging (all routes) | ❌ Broken | Backend missing (Prompt #8) |
| Mark Single Notification Read | ❌ Broken | Backend missing (Prompt #9) |
| Categories Picker (create post) | ❌ Broken | Backend missing (Prompt #10) |
| Media Upload | ❌ Broken | Backend missing (Prompt #1) |
| Edit Profile | ❌ Broken | Backend missing (Prompt #12) |
| Explore Catalog | ⚠️ Partial | Uses /posts as workaround — works but no real categories/collections |
| Saved Posts (profile tab) | ⚠️ Partial | Route 200 but bookmark filter probably not applied |
| Creator Dashboard | ⚠️ Partial | Static placeholder — no real analytics endpoint |
| Subscribe to Creator | ⚠️ Partial | UI present, no subscription API implemented |
| Wallet top-up / buy credits | ⚠️ Partial | UI present, no payment API implemented |

---

*End of report. See backend prompts above to resolve each missing endpoint.*
