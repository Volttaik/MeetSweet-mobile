# MeetSweet — Complete Mobile App Build Guide

> This document is written for the developer building the MeetSweet mobile app.
> Read the whole thing before writing a line of code. It explains what MeetSweet is,
> how every system works conceptually, and then gives you the exact API calls to implement it.

---

## Part 1 — What Is MeetSweet?

MeetSweet is a **creator-subscription social platform**. Think of it as a combination of Instagram, TikTok, and a subscription fan platform.

The core idea is this: **creators post content and earn money from subscriptions and album sales**. Regular users subscribe to creators they like to see their content. Creators can share three types of content — posts (images), videos, and shorts — and can also sell curated albums (bundles of media) directly.

There is no advertising. There is no algorithm pushing strangers' content into your feed uninvited. Your home feed is made entirely of people you have chosen to pay to follow. The Explore page exists for discovering new creators before you subscribe.

---

## Part 2 — The User Types

### Regular User
A normal account. Can subscribe to creators, watch/read content, like, comment, message, purchase albums, and manage their wallet.

### Creator
Any user can "become a creator" — it's a toggle on their account (`is_creator: true`). Once a creator, they can:
- Post content at any visibility tier
- Set a subscription price
- Sell albums
- Receive payments and withdraw earnings
- See their own statistics

A user can be both a regular user (subscribing to others) and a creator (earning from their own subscribers) at the same time.

---

## Part 3 — The Tier / Visibility System

This is the most important concept to understand. **Every piece of content has a `visibility` field.**

### The three visibility levels

#### `"public"` — Free Tier
- Visible to **everyone**, no account or subscription required
- Appears on the **Explore page** for discovery
- Also appears in the **home feed** of subscribers to that creator
- The creator uses public posts as "previews" to attract new subscribers

#### `"subscribers"` — Subscriber Tier
- Only visible to **users who are actively subscribed to that creator**
- Does **NOT** appear on Explore
- Only appears in the **home feed** of that creator's subscribers
- This is the premium content subscribers are paying for

#### `"draft"` — Draft
- Only visible to the creator themselves
- Never appears in any feed
- Used to save work-in-progress content

### The subscription model — there is only ONE tier per creator

There is **no multi-tier system** (no "Bronze/Silver/Gold"). Each creator has a single subscription price. When you subscribe, you get access to **all** of that creator's `subscribers`-visibility content plus all their `public` content.

You either subscribe or you don't. There's no partial access.

### What subscriptions unlock

When you subscribe to a creator:
- Their `public` content appears in your home feed
- Their `subscribers` content also appears in your home feed
- You can message them (if the creator allows DMs)
- You can view their full profile page with all their content

When you are NOT subscribed:
- Their content does NOT appear in your home feed at all
- You can only see their `public` content on the Explore page
- If you visit their profile page directly, you see a **"Subscribe to continue"** wall — no content, just their name/bio/stats and a subscribe button

### There is NO per-post locking

There are no "unlock this post for X credits" mechanics on individual posts, videos, or shorts. Content is either free (Explore) or subscriber-only (home feed). The only individual purchase mechanic is **albums** (see Part 7).

---

## Part 4 — The Three Content Types

### Post (`content_type: "post"`)
**What it is:** An image or multi-image post. Like an Instagram post. Can contain 1–10 images or video clips, plus a text caption.

**Where it appears:**
- Explore page (if `public`)
- Home feed (if creator is subscribed to)
- Creator's profile page (requires subscription to view profile)

**What the UI looks like:** A scrollable card feed. Tap to open full-screen. Swipe through media if multiple items. Like, comment, bookmark, share.

**Who can post:** Any user with a creator account.

---

### Video (`content_type: "video"`)
**What it is:** A long-form video. Like YouTube. Has a `title`, `description`, and a main video file. Duration can be anything — typically minutes to hours.

**Where it appears:**
- Explore page (if `public`)
- Home feed (if creator is subscribed to)
- A dedicated **Videos** section/tab

**What the UI looks like:** Horizontal video cards with thumbnail, title, creator name, view count. Tap to open a full-screen video player. Like, comment, share.

**Who can post:** Creators only.

---

### Short (`content_type: "short"`)
**What it is:** A short vertical video. Like TikTok or Instagram Reels. No title or description — just a caption and the video. Usually under 60 seconds.

**Where it appears:**
- Explore page (if `public`)
- Home feed (if creator is subscribed to)
- A dedicated **Shorts** vertical swipe feed

**What the UI looks like:** Full-screen vertical video that auto-plays. Swipe up/down to go to next/previous short. Like, comment, share overlaid on the video. Like TikTok.

**Important:** A Short is only a Short if `content_type === "short"`. Do NOT show `content_type: "video"` posts in the Shorts feed, even if they happen to contain a video file.

**Who can post:** Creators only.

---

### Album
**What it is:** A curated bundle of media (images + videos) sold as a single purchase. Like a photo book or a digital zine. Albums have a cover image, a title, a description, a price in credits, and a list of media items.

**Where it appears:**
- Explore page (in a dedicated Albums section)
- Creator's profile page

**What the UI looks like:** A card showing the cover image, title, creator, item count, and price. Tap to see the album detail — description, preview of cover, price, and a purchase button. After purchase, the user can view all items inside.

**Access model:** Albums are purchased once with in-app credits. After purchase, you own that album permanently — it appears in your purchased albums list. No subscription needed to buy an album, and no album access included in subscriptions. They are completely separate transactions.

**Who can create:** Creators only.

---

## Part 5 — The Home Feed

The home feed is **the core of the app**. It is the main tab, the first thing users see after opening.

### What's in the home feed

The home feed is a **mix of all content types** from creators the user subscribes to:
- Posts (`content_type: "post"`) from subscribed creators
- Videos (`content_type: "video"`) from subscribed creators
- Shorts (`content_type: "short"`) from subscribed creators
- The user's own content (all their posts/videos/shorts regardless of visibility)

Both `public` and `subscribers` content from subscribed creators appears in the home feed.

### What is NOT in the home feed

- Content from creators the user doesn't subscribe to
- `draft` content (creator can see their own drafts in their profile, not in the main feed)
- Albums (albums are browsed separately)

### When the home feed is empty

If a user has zero subscriptions, their home feed is completely empty. This is intentional. The app should show an empty state with a clear CTA: **"Subscribe to creators on Explore to see their content here."**

Do not show random public content in the home feed as a fallback. The emptiness is a signal that tells users to go subscribe to someone.

### How to build the home feed

The backend does not have a single `/api/home-feed` endpoint. The frontend assembles it:

1. Fetch the user's subscriptions: `GET /api/subscriptions?type=subscribed`
2. For each subscribed creator, fetch their recent content:
   - `GET /api/creators/:id/posts`
   - `GET /api/creators/:id/videos`
   - `GET /api/creators/:id/shorts`
3. Also fetch the user's own content: `GET /api/posts?creator_id=<my_id>`
4. Merge and sort all results by `published_at` descending
5. Render as a unified mixed feed

The creator-specific endpoints already handle the subscription visibility filter — a subscribed user gets `public + subscribers` content, a non-subscriber only gets `public` content.

---

## Part 6 — The Explore Page

The Explore page is the **public discovery surface**. It shows only `visibility: "public"` content.

### What's on Explore

- A unified ranked feed of public posts, videos, and shorts from all creators
  - Ranked by engagement score: `like_count + comment_count + view_count`
- A supplementary Albums section (for browsing purchasable albums)
- A featured Creators section (for discovering who to subscribe to)

### What is NOT on Explore

- `subscribers`-visibility content (never)
- `draft` content (never)
- Your own posts (they show on your profile and home feed, not on the public Explore)

### How Explore works

`GET /api/explore` returns a combined response:
```
items      → mixed posts/videos/shorts in one engagement-ranked list
posts      → only the post items from `items` (filtered slice)
videos     → only the video items from `items` (filtered slice)
shorts     → only the short items from `items` (filtered slice)
albums     → supplementary album cards (separate section)
users      → featured creator cards (separate section)
```

You can render `items` as one unified scrolling feed, or use the filtered slices for a tabbed layout (Posts | Videos | Shorts tabs inside Explore).

---

## Part 7 — Albums in Detail

### The purchase flow

1. User browses albums on Explore or a creator's profile
2. Taps an album card → Album Detail screen
3. If not purchased: sees cover, description, item count, price in credits, and a **Purchase** button
4. Taps Purchase → backend deducts credits from user's wallet, credits the creator
5. User now owns the album — the **Purchase** button changes to a **View** button
6. User can view all media items inside the album

### Credits and wallet

Credits are the in-app currency. Users top up their wallet using Paystack (Nigerian payment gateway). Credits are debited for album purchases and credited to creators. Creators can withdraw their credit earnings to their bank account.

### What album items look like

Each album item is a media object: an image or video. The same shape as post/video media objects — `url`, `type`, `thumbnail_url`, `width`, `height`, `duration_secs`.

Before purchase, items are locked (no real URLs shown).
After purchase, full media URLs are available.

---

## Part 8 — Creator Profiles

### What a creator profile shows

- Creator's avatar, banner, display name, username, bio
- Stats: follower count, following count, post count
- Subscription price
- Content tabs: Posts | Videos | Shorts | Albums

### The subscription wall

**If the viewing user is NOT subscribed:**
- Show the header (avatar, name, bio, stats, subscription price)
- Show a prominent **"Subscribe to [Creator Name]"** button
- Do NOT show any content — no post grid, no video list, nothing
- The wall text: something like "Subscribe to see [Creator]'s content"

**Why?** Because even their public content should be discoverable on Explore, not freely browsable from the profile. The profile is an intimate space — you either commit to subscribing or you discover them through Explore's public feed.

**If the viewing user IS subscribed:**
- Show all tabs (Posts, Videos, Shorts, Albums)
- Each tab loads from `GET /api/creators/:id/posts|videos|shorts|albums`
- The backend returns both `public` and `subscribers` content to subscribers

### How to detect subscription status

Every content object returned from creator endpoints includes `subscribed_to_creator: boolean`. You can also check it on the creator detail endpoint `GET /api/creators/:id`.

---

## Part 9 — Messaging

Messaging is a direct, one-to-one system between users.

### Access rules

- You can only message someone if:
  1. You are subscribed to them (if they are a creator with a subscription gate), OR
  2. The creator has `allow_dms: true` in their settings
- Regular user-to-user messaging (non-creator) has no subscription gate

### How conversations work

- A conversation is a persistent thread between two users
- Creating a conversation with the same user twice returns the existing conversation (idempotent)
- Conversations can be archived (hidden from main list, accessible in "archived" tab)
- Conversations can be muted (no push notifications)

### Message types

Messages can contain:
- Text (`body`)
- Media (`media_url` + `media_type`) — images, videos, audio
- Replies to previous messages (`reply_to_id`)
- Reactions (emoji reactions on messages)

### Message loading

Messages are paginated in reverse chronological order (newest first). To load older messages, pass the oldest message's `created_at` as the `before` query param.

---

## Part 10 — The Auth System

### Registration flow

```
1. User fills in: full name, username, email, phone (optional), password, confirm password
2. POST /api/auth/register
3. Backend creates the account (unverified), sends a 6-digit code to the email
4. Response: { requires_verification: true, email: "..." } — NO tokens
5. App navigates to Email Verification screen
```

**Critical:** No tokens are returned on registration. The user cannot do anything until they verify their email.

### Email verification flow

```
1. User is on the Email Verification screen
2. User enters the 6-digit code from their email
3. POST /api/auth/verify-email  { email, code }
4. Success: { verified: true }
5. App navigates to Login screen with a success message
```

If the code expires (codes last 15 minutes), the user can request a new one:
```
POST /api/auth/resend-verification  { email }
```

### Login flow

```
1. User enters email + password
2. POST /api/auth/login
3a. Success: returns access_token + refresh_token + user object
    → Store tokens securely, navigate to home feed
3b. Error "EMAIL_NOT_VERIFIED": backend resends a fresh code
    → Navigate to Email Verification screen
3c. Error 401: wrong credentials
    → Show "Invalid email or password"
3d. Error 429: too many attempts
    → Show countdown timer using Retry-After header
```

### Token management

- `access_token` lives for 15 minutes. Attach it to every authenticated request as `Authorization: Bearer <token>`.
- `refresh_token` lives for 30 days. When a request returns 401, use the refresh token to get a new access token, then retry the original request.
- On logout: call `POST /api/auth/logout` with the refresh token to revoke it, then clear both tokens from storage.
- Both tokens are JWTs signed with HS256. Verify expiry client-side before sending requests if you want to avoid unnecessary 401s.

### Password reset flow

```
1. User taps "Forgot password" on login screen
2. User enters their email
3. POST /api/auth/forgot-password  { email }
4. Response is always 200 (anti-enumeration) — backend sends code if account exists
5. Navigate to Reset Password screen
6. User enters the 6-digit code + new password
7. POST /api/auth/reset-password  { email, code, new_password }
8. Success: all existing sessions revoked, navigate to Login
```

---

## Part 11 — Security Requirements

**Every single API request must include this header:**
```
X-Client-App-Id: meetsweet-mobile
```

Requests without this header receive `403 Forbidden` immediately, before any route logic runs. This protects the API from being used without the official client. Build this into your base API client so it's never forgotten.

**Rate limiting** is enforced on all auth endpoints. If a user hits a rate limit, they get a `429 Too Many Requests` response with a `Retry-After: <seconds>` header. Your UI should show a countdown: "Please wait 47 seconds before trying again."

Rate limits:
- Login: 10 attempts per 15 min per IP, 5 per 15 min per email
- Register: 5 per hour per IP
- Forgot password: 5 per 15 min per IP, 3 per hour per email
- Resend verification: 5 per 15 min per IP, 3 per hour per email

---

## Part 12 — Media Upload

**Files are never uploaded through the MeetSweet server.** The app uploads directly to Cloudflare R2 storage using short-lived presigned URLs.

### Upload flow (always use this)

```
Step 1 — Get a presigned URL
GET /api/credentials/upload-url     (Auth required)

Response:
{
  "upload_url": "https://r2.cloudflare.com/...?X-Amz-Signature=...",
  "blob_path": "uploads/uuid/filename.mp4",
  "url": "https://cdn.example.com/uploads/uuid/filename.mp4",
  "expires_in": 900
}

Step 2 — Upload directly to R2
PUT <upload_url>
Headers: Content-Type: <mime type of the file>
Body: raw file bytes
(Do NOT add Authorization header — the presigned URL already has credentials embedded)

Step 3 — Register with the backend
POST /api/media
Body: {
  "url": "<url from Step 1>",
  "blob_path": "<blob_path from Step 1>",
  "type": "image | video",
  "mime_type": "video/mp4",
  "size_bytes": 1048576,
  "width": 1920,
  "height": 1080,
  "duration_seconds": 185,
  "thumbnail_url": "https://... (for videos — generate a thumbnail first)"
}

Response: { "id": "uuid", ...all media fields }

Step 4 — Use the media ID when creating content
POST /api/posts  Body: { "media_ids": ["<id from Step 3>"] }
POST /api/videos Body: { "media_ids": ["<id from Step 3>"] }
POST /api/shorts Body: { "media_ids": ["<id from Step 3>"] }
```

The presigned URL is valid for 15 minutes. If upload fails, request a new one.

---

## Part 13 — The Complete API Reference

### Response envelope
Every response:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "Human readable message", "code": "MACHINE_CODE" }
```
Always check `ok` before accessing `data`.

### Required header on ALL requests
```
X-Client-App-Id: meetsweet-mobile
```

### Auth header on authenticated requests
```
Authorization: Bearer <access_token>
```

---

### AUTH ENDPOINTS

#### Register
```
POST /api/auth/register
Body:
{
  "full_name":        string  (2–100 chars)
  "username":         string  (2–30 chars, letters/numbers/underscore only)
  "email":            string  (valid email)
  "phone":            string? (optional)
  "password":         string  (8–128 chars)
  "confirm_password": string  (must match password)
}

201 Response:
{
  "message": "Account created. Please check your email for a verification code.",
  "requires_verification": true,
  "email": "user@example.com"
}

Errors:
  409 — email already exists
  409 — username already taken
```

No tokens on register. Navigate to Email Verification screen.

---

#### Verify Email
```
POST /api/auth/verify-email
Body:
{
  "email": string,
  "code":  string (exactly 6 digits)
}

200 Response: { "verified": true }

Errors:
  400 — invalid or expired code
```

---

#### Resend Verification Code
```
POST /api/auth/resend-verification
Body: { "email": string }

200 Response: { "message": "..." }    ← always 200, even if email not found
```

---

#### Login
```
POST /api/auth/login
Body:
{
  "email":     string,
  "password":  string,
  "device_id": string? (optional — use a stable device UUID from expo-device or expo-application)
}

200 Response:
{
  "access_token":  "eyJ...",
  "refresh_token": "eyJ...",
  "token_type":    "Bearer",
  "expires_in":    900,
  "user": {
    "id":         "uuid",
    "full_name":  "Jane Doe",
    "username":   "janedoe",
    "email":      "jane@example.com",
    "role":       "user",
    "is_creator": false
  }
}

Errors:
  401 — wrong email or password
  403 code=EMAIL_NOT_VERIFIED — navigate to email verification screen
  429 — rate limited, check Retry-After header
```

---

#### Refresh Token
```
POST /api/auth/refresh
Body: { "refresh_token": string }

200 Response: (same shape as login response)
```

Old refresh token is invalidated immediately after rotation.

---

#### Logout
```
POST /api/auth/logout
Auth: required
Body: { "refresh_token": string? }  ← include to fully revoke the session

200 Response: { "logged_out": true }
```

---

#### Logout All Devices
```
POST /api/auth/logout-all
Auth: required

200 Response: { "logged_out": true }
```

---

#### Forgot Password
```
POST /api/auth/forgot-password
Body: { "email": string }

200 Response: { "message": "..." }    ← always 200
```

---

#### Reset Password
```
POST /api/auth/reset-password
Body:
{
  "email":        string,
  "code":         string (6 digits),
  "new_password": string (8–128)
}

200 Response: { "reset": true }
```

All sessions revoked after reset.

---

#### Change Password
```
POST /api/auth/change-password
Auth: required
Body:
{
  "current_password": string,
  "new_password":     string (8–128)
}

200 Response: { "changed": true }
```

---

#### Delete Account
```
DELETE /api/auth/delete-account
Auth: required
Body: { "password": string }

200 Response: { "deleted": true }
```

Soft-deletes account and revokes all sessions.

---

#### Username Availability
```
GET /api/auth/username-availability?username=janedoe

200 Response: { "available": true, "username": "janedoe" }
```

Use for real-time validation during registration (debounce to ~500ms).

---

### USER ENDPOINTS

#### Get Own Profile
```
GET /api/users/me
Auth: required

Response:
{
  "id":                 "uuid",
  "full_name":          "Jane Doe",
  "username":           "janedoe",
  "email":              "jane@example.com",
  "phone":              null,
  "role":               "user",
  "is_creator":         false,
  "is_verified":        true,
  "created_at":         "ISO",
  "display_name":       "Jane",
  "bio":                "Hello world",
  "avatar_url":         "https://...",
  "banner_url":         null,
  "website":            null,
  "location":           null,
  "is_verified_creator": false,
  "subscription_price": null,
  "follower_count":     0,
  "following_count":    0,
  "post_count":         0
}
```

---

#### Update Own Profile
```
PATCH /api/users/me
Auth: required
Body (all optional):
{
  "full_name":    string (2–100),
  "display_name": string (1–100),
  "username":     string (2–30, alnum+underscore),
  "bio":          string (max 300) | null,
  "avatar_url":   URL | null,
  "banner_url":   URL | null,
  "website":      URL | null,
  "location":     string (max 100) | null
}

Response: { "user": { ...updated profile fields } }
```

---

#### Get Public Profile (by username)
```
GET /api/users/:username
Auth: optional

Response: public profile fields + follower/following counts
```

---

#### Follow / Unfollow
```
POST   /api/users/:username/follow    Auth: required
DELETE /api/users/:username/follow    Auth: required
```

---

#### Block / Unblock
```
POST   /api/users/:username/block     Auth: required
DELETE /api/users/:username/block     Auth: required
```

---

#### Search Users
```
GET /api/users/search?q=jane
Auth: required  (min 2 chars)

Response:
{
  "users": [
    { "id", "name", "full_name", "username", "avatar_url", "is_verified", "is_creator" }
  ]
}
```

---

### POST ENDPOINTS

#### Get Posts Feed
```
GET /api/posts
Auth: optional (required for bookmarked=true)
Query params:
  cursor     string   pagination cursor (use next_cursor from previous response)
  limit      number   default 20, max 50
  bookmarked boolean  true = my saved posts only
  creator_id string   filter to one creator

Response:
{
  "posts": [ ...PostObject... ],
  "next_cursor": "2026-08-01T12:00:00.000Z__uuid" | null,
  "nextCursor":  "2026-08-01T12:00:00.000Z__uuid" | null,
  "page":  1,
  "limit": 20
}
```

**PostObject:**
```json
{
  "id":                    "uuid",
  "content_type":          "post",
  "creator_id":            "uuid",
  "creator_username":      "janedoe",
  "creator_display_name":  "Jane Doe",
  "creator_avatar":        "https://...",
  "creator_is_verified":   false,
  "caption":               "Hello world",
  "visibility":            "public",
  "status":                "published",
  "is_pinned":             false,
  "preview_duration":      null,
  "like_count":            12,
  "comment_count":         3,
  "save_count":            1,
  "view_count":            100,
  "published_at":          "ISO",
  "created_at":            "ISO",
  "updated_at":            "ISO",
  "liked_by_me":           false,
  "bookmarked_by_me":      false,
  "media": [
    {
      "url":           "https://cdn.example.com/image.jpg",
      "type":          "image",
      "thumbnail_url": "https://cdn.example.com/thumb.jpg",
      "duration_secs": null,
      "file_size":     1048576,
      "width":         1080,
      "height":        1080
    }
  ]
}
```

Pagination: pass `next_cursor` as `?cursor=` for the next page. `null` = no more pages.

---

#### Get Single Post
```
GET /api/posts/:id
Auth: optional

Response: PostObject with liked_by_me, bookmarked_by_me populated
```

---

#### Create Post
```
POST /api/posts
Auth: required
Body:
{
  "caption":          string | null (max 2200),
  "visibility":       "public" | "subscribers" | "draft"  (default: "public"),
  "media_ids":        string[],   ← preferred: IDs from POST /api/media
  "media":            MediaInput[],  ← legacy inline, avoid
  "preview_duration": number | null,
  "expires_at":       string (ISO, optional)
}

201 Response: { "id": "uuid" }
```

---

#### Update Post
```
PATCH /api/posts/:id
Auth: required (owner only)
Body (all optional): { "caption", "visibility", "is_pinned" }
```

---

#### Delete Post
```
DELETE /api/posts/:id
Auth: required (owner or admin)
```

---

#### Like / Unlike Post
```
POST   /api/posts/:id/like    → { "liked": true,  "like_count": N }
DELETE /api/posts/:id/like    → { "liked": false, "like_count": N }
Auth: required
```

---

#### Bookmark / Unbookmark Post
```
POST   /api/posts/:id/bookmark    → { "bookmarked": true }
DELETE /api/posts/:id/bookmark    → { "bookmarked": false }
Auth: required
```

---

#### Record Post View
```
POST /api/posts/:id/view
Auth: optional

Response: { "viewed": true }
```

Call this when the post has been visible for ≥1 second.

---

#### Hide Post from Feed
```
POST   /api/posts/:id/hide    → { "hidden": true }
DELETE /api/posts/:id/hide    → { "hidden": false }
Auth: required
```

---

#### Report Post
```
POST /api/posts/:id/report
Auth: required
Body:
{
  "reason":      string (1–100),
  "description": string (optional, max 500)
}
Response: { "reported": true }
```

---

#### Comments on a Post
```
GET /api/posts/:id/comments
Auth: optional
Query: limit (default 20, max 50)

CommentObject:
{
  "id":          "uuid",
  "body":        "Great post!",
  "is_pinned":   false,
  "like_count":  2,
  "reply_count": 1,
  "liked_by_me": false,
  "created_at":  "ISO",
  "updated_at":  "ISO",
  "author": { "id", "name", "username", "avatar_url" }
}
```

```
POST /api/posts/:id/comments
Auth: required
Body: { "body": string (1–1000) }
Response: CommentObject
```

```
PATCH  /api/posts/:id/comments/:commentId    Body: { "body": string }  (owner only)
DELETE /api/posts/:id/comments/:commentId                               (owner/admin)
```

```
POST   /api/posts/:id/comments/:commentId/like
DELETE /api/posts/:id/comments/:commentId/like
Auth: required
```

---

#### Replies on a Comment
```
GET /api/posts/:id/comments/:commentId/replies
Auth: optional
Query: limit (default 20, max 50)

ReplyObject: { "id", "body", "like_count", "created_at", "updated_at", "author" }
```

```
POST /api/posts/:id/comments/:commentId/replies
Auth: required
Body: { "body": string (1–1000), "mention_id": uuid (optional) }
Response: ReplyObject
```

---

### VIDEO ENDPOINTS

#### Get Videos Feed
```
GET /api/videos
Auth: optional
Query: cursor (created_at cursor), limit (default 20, max 50)

Response:
{
  "videos":      [ ...VideoObject... ],
  "items":       [ ...VideoObject... ],  ← same as videos, both keys exist
  "next_cursor": string | null,
  "has_more":    boolean,
  "hasMore":     boolean
}
```

**VideoObject:**
```json
{
  "id":                     "uuid",
  "content_type":           "video",
  "contentType":            "video",
  "title":                  "My Video Title",
  "description":            "Full description",
  "caption":                null,
  "video_url":              "https://cdn.example.com/video.mp4",
  "videoUrl":               "https://cdn.example.com/video.mp4",
  "thumbnail_url":          "https://cdn.example.com/thumb.jpg",
  "thumbnailUrl":           "https://cdn.example.com/thumb.jpg",
  "duration_secs":          185,
  "durationSecs":           185,
  "view_count":             2400,
  "viewCount":              2400,
  "like_count":             88,
  "likeCount":              88,
  "comment_count":          14,
  "commentCount":           14,
  "share_count":            5,
  "shareCount":             5,
  "is_premium":             false,
  "isPremium":              false,
  "liked_by_me":            false,
  "likedByMe":              false,
  "subscribed_to_creator":  false,
  "subscribedToCreator":    false,
  "created_at":             "ISO",
  "createdAt":              "ISO",
  "published_at":           "ISO",
  "creator": {
    "id":         "uuid",
    "name":       "Jane Doe",
    "username":   "janedoe",
    "avatarUrl":  "https://...",
    "avatar_url": "https://...",
    "isVerified": false,
    "is_verified": false
  },
  "comments_preview": [ ...up to 2 CommentObjects... ],
  "commentsPreview":  [ ...up to 2 CommentObjects... ],
  "media": [
    { "url": "...", "type": "video", "thumbnail_url": "...", "duration_secs": 185 }
  ]
}
```

> The API returns both snake_case and camelCase for every field. Pick one style in your code and be consistent.

---

#### Get Video Detail
```
GET /api/videos/:id
Auth: optional

Response: { "video": VideoObject }
```

---

#### Like / Unlike Video
```
POST   /api/videos/:id/like    → { "liked": true,  "like_count": N }
DELETE /api/videos/:id/like    → { "liked": false, "like_count": N }
Auth: required
```

---

#### Video Recommendations
```
GET /api/videos/recommendations
Auth: optional
Query: video_id (exclude this video ID), limit (default 10, max 20)

Response: { "videos": [...], "items": [...] }
```

---

#### Create Video
```
POST /api/videos
Auth: required
Body:
{
  "title":       string | null (max 300),
  "description": string | null (max 5000),
  "caption":     string | null (max 2200),
  "visibility":  "public" | "subscribers" | "draft",
  "media_ids":   string[],
  "categories":  string[],
  "tags":        string[]
}
201 Response: { "id": "uuid" }
```

---

### SHORTS ENDPOINTS

#### Get Shorts Feed
```
GET /api/shorts/feed
Auth: optional
Query: cursor, limit (default 20, max 50)

Response:
{
  "shorts":      [ ...ShortObject... ],
  "items":       [ ...ShortObject... ],
  "next_cursor": string | null,
  "has_more":    boolean
}
```

**ShortObject:** Same shape as VideoObject but:
- `content_type: "short"` / `contentType: "short"`
- No `title`, `description`, or `comments_preview` fields
- Has `caption`

---

#### Get Short Detail
```
GET /api/shorts/:id
Auth: optional

Response: { "short": ShortObject }
```

---

#### Like / Unlike Short
```
POST   /api/shorts/:id/like    → { "liked": true,  "like_count": N }
DELETE /api/shorts/:id/like    → { "liked": false, "like_count": N }
Auth: required
```

---

#### Short Recommendations
```
GET /api/shorts/recommendations
Auth: optional
Query: short_id (exclude), limit (default 10, max 20)

Response: { "shorts": [...], "items": [...] }
```

---

#### Create Short
```
POST /api/shorts
Auth: required
Body:
{
  "caption":    string | null (max 2200),
  "visibility": "public" | "subscribers" | "draft",
  "media_ids":  string[],
  "categories": string[],
  "tags":       string[]
}
201 Response: { "id": "uuid" }
```

---

### EXPLORE ENDPOINT

```
GET /api/explore
Auth: optional
Query: page (default 1), limit (default 20, max 50)

Response:
{
  "items":      [...mixed PostObject/VideoObject/ShortObject, engagement-ranked...],
  "posts":      [...only posts from items...],
  "videos":     [...only videos from items...],
  "shorts":     [...only shorts from items...],
  "albums":     [...AlbumCard objects...],
  "users":      [...FeaturedCreator objects...],
  "page":       1,
  "limit":      20,
  "has_more":   true,
  "hasMore":    true,
  "next_page":  2,
  "nextPage":   2,
  "next_cursor": "2",
  "nextCursor":  "2"
}
```

**AlbumCard:**
```json
{
  "id":                    "uuid",
  "content_type":          "album",
  "creator_id":            "uuid",
  "creator_username":      "janedoe",
  "creator_display_name":  "Jane Doe",
  "creator_avatar":        "https://...",
  "creator_is_verified":   false,
  "creator": { "id", "name", "username", "avatarUrl", "avatar_url", "isVerified" },
  "title":         "My Album",
  "description":   "...",
  "thumbnail_url": "https://...",
  "cover_url":     "https://...",
  "price_credits": 500,
  "is_premium":    true,
  "item_count":    12,
  "created_at":    "ISO"
}
```

**FeaturedCreator:**
```json
{
  "id":                  "uuid",
  "name":                "Jane Doe",
  "full_name":           "Jane Doe",
  "username":            "janedoe",
  "avatar_url":          "https://...",
  "avatarUrl":           "https://...",
  "bio":                 "...",
  "is_verified":         false,
  "isVerified":          false,
  "is_creator":          true,
  "is_verified_creator": false
}
```

---

### CREATOR ENDPOINTS

#### Get Creator Profile
```
GET /api/creators/:id
Auth: optional
(:id can be a UUID or a username)
```

---

#### Creator's Posts (subscription-aware)
```
GET /api/creators/:id/posts
Auth: optional
Query: cursor, limit (default 20, max 50)

Response:
{
  "posts":       [...PostObject with subscribed_to_creator field...],
  "next_cursor": string | null,
  "has_more":    boolean
}
```

Subscribed users get `public + subscribers` content.
Non-subscribers get `public` content only (often empty for creators who post primarily subscriber content).

---

#### Creator's Videos
```
GET /api/creators/:id/videos
Auth: optional

Response: { "videos": [...VideoObject...] }
```

---

#### Creator's Shorts
```
GET /api/creators/:id/shorts
Auth: optional

Response: { "shorts": [...ShortObject...] }
```

---

#### Creator's Albums
```
GET /api/creators/:id/albums
Auth: optional

Response: { "albums": [...AlbumCard...] }
```

---

#### Creator Stats
```
GET /api/creators/:id/stats
Auth: optional
```

---

#### Creator Reviews
```
GET  /api/creators/:id/reviews

POST /api/creators/:id/reviews
Auth: required
Body: { "rating": 1–5, "body": string (optional) }
201 Response: { "review_id": "uuid", "rating": number }
```

---

#### Creator Subscribers List
```
GET /api/creators/:id/subscribers
Auth: required (creator only)
```

---

### SUBSCRIPTION ENDPOINTS

#### List Subscriptions
```
GET /api/subscriptions
Auth: required
Query: type = "subscribed" (default) | "subscribers"

"subscribed"   → creators I am subscribed to
"subscribers"  → users subscribed to me (requires is_creator)
```

---

#### Subscribe to Creator
```
POST /api/subscriptions
Auth: required
Body: { "creator_id": "uuid" }
```

---

### ALBUM ENDPOINTS

#### List All Albums
```
GET /api/albums
Auth: optional
Query: page, limit
```

---

#### Get Album Detail
```
GET /api/albums/:id
Auth: optional

Response:
{
  "id":           "uuid",
  "creator_id":   "uuid",
  "title":        "My Album",
  "description":  "...",
  "cover_url":    "https://...",
  "price_credits": 500,
  "is_premium":   true,
  "visibility":   "public",
  "item_count":   12,
  "created_at":   "ISO",
  "is_purchased": false,
  "creator": { "id", "username", "display_name", "avatar_url", "is_verified" }
}
```

---

#### Purchase Album
```
POST /api/albums/:id/purchase
Auth: required

200 Response: { "purchased": true }
402 Response: insufficient credits
```

---

#### List Album Items
```
GET /api/albums/:id/items
Auth: required

Response: { "items": [...MediaObject...] }
```

Non-purchasers receive locked placeholder items (no real URLs).
Purchasers receive full media URLs.

---

#### Create Album (creators)
```
POST /api/albums
Auth: required
Body:
{
  "title":         string,
  "description":   string (optional),
  "cover_url":     URL,
  "price_credits": number,
  "is_premium":    boolean,
  "visibility":    "public" | "private"
}
```

---

#### Update Album
```
PATCH /api/albums/:id
Auth: required (owner)
```

---

#### Delete Album
```
DELETE /api/albums/:id
Auth: required (owner)
```

---

#### Add Item to Album
```
POST /api/albums/:id/items
Auth: required (owner)
Body: { "media_id": "uuid", "sort_order": 0 }
```

---

#### Remove Item from Album
```
DELETE /api/albums/:id/items/:mediaId
Auth: required (owner)
```

---

### MEDIA ENDPOINTS

#### Register Media (after R2 upload)
```
POST /api/media
Auth: required
Body:
{
  "url":              URL,
  "blob_path":        string,
  "type":             "image" | "video" | "audio" | "document" | "other",
  "post_id":          uuid (optional — can associate later),
  "mime_type":        string (optional),
  "size_bytes":       integer (optional),
  "width":            integer (optional),
  "height":           integer (optional),
  "duration_seconds": number (optional),
  "thumbnail_url":    URL | null (optional, for videos),
  "file_name":        string (optional)
}

Response: { "id": "uuid", ...all submitted fields }
```

---

#### Multipart Upload (for smaller files)
```
POST /api/media/upload
Auth: required
Form data:
  file      Blob (required)
  post_id   string (optional)
  folder    "posts" | "avatars"  (default: "posts")
  file_name string (optional)

Response: { "id", "url", "key", "type", "mime_type", "size_bytes" }
```

---

### MESSAGING ENDPOINTS

#### List Conversations
```
GET /api/conversations
Auth: required
Query: tab = "all" (default) | "archived"

Response:
{
  "conversations": [
    {
      "id":         "uuid",
      "other_user": { "id", "username", "display_name", "avatar_url" },
      "last_message": { "body", "created_at" },
      "unread_count": 3,
      "is_archived":  false,
      "created_at":   "ISO"
    }
  ]
}
```

---

#### Create / Open Conversation
```
POST /api/conversations
Auth: required
Body: { "user_id": "uuid" }

Response: ConversationObject (returns existing if already exists)
```

---

#### List Messages
```
GET /api/conversations/:id/messages
Auth: required
Query: before (ISO timestamp), limit (default 20)

Returns newest-first. Pass oldest message's created_at as "before" to load more.

MessageObject:
{
  "id":          "uuid",
  "body":        "Hey!",
  "media_url":   null,
  "media_type":  null,
  "reply_to_id": null,
  "sender_id":   "uuid",
  "created_at":  "ISO",
  "is_read":     true
}
```

---

#### Send Message
```
POST /api/conversations/:id/messages
Auth: required
Body:
{
  "body":        string (optional if media_url set),
  "media_url":   URL (optional),
  "media_type":  "image" | "video" | "audio" | "document" (optional),
  "reply_to_id": uuid (optional)
}
```

---

#### Archive / Unarchive
```
PUT /api/conversations/:id/archive
Auth: required
Body: { "archived": boolean }
```

---

#### Delete Message (recall)
```
DELETE /api/messages/:id
Auth: required (sender only)
```

---

#### Message Reactions
```
POST   /api/messages/:id/reactions    Body: { "emoji": "❤️" }
DELETE /api/messages/:id/reactions
Auth: required
```

---

#### Mark Conversation as Read
```
POST /api/messages/conversations/:conversationId/read
Auth: required
```

---

### NOTIFICATION ENDPOINTS

#### List Notifications
```
GET /api/notifications
Auth: required

NotificationObject:
{
  "id":          "uuid",
  "type":        "like | comment | follow | mention | ...",
  "body":        "Jane liked your post",
  "is_read":     false,
  "created_at":  "ISO",
  "actor":       { "id", "username", "avatar_url" },
  "entity_id":   "uuid",
  "entity_type": "post | video | short | comment"
}
```

---

#### Mark Single as Read
```
PUT /api/notifications/:id/read
Auth: required
```

---

#### Mark All as Read
```
POST /api/notifications/read-all
Auth: required
```

---

### PAYMENT ENDPOINTS

#### Get Wallet Balance
```
GET /api/payments/balance
Auth: required

Response: { "balance": 5000, "currency": "NGN" }
```

---

#### Initiate Paystack Payment (top up wallet)
```
POST /api/payments/initiate-paystack
Auth: required
Body: { "amount": 5000, "callback_url": "https://..." }

Response: { "authorization_url": "https://paystack.com/pay/...", "reference": "..." }
```

Open `authorization_url` in an in-app browser. After payment, Paystack redirects to `callback_url`.

---

#### Verify Paystack Payment
```
POST /api/payments/verify-paystack
Auth: required
Body: { "reference": "paystack_reference" }

Response: { "verified": true, "amount": 5000, "new_balance": 10000 }
```

Call this after returning from the Paystack WebView.

---

#### Save Bank Details (creators)
```
POST /api/payments/save-bank-details
Auth: required
Body: { "bank_code": "...", "account_number": "...", "account_name": "..." }
```

---

#### Withdraw Earnings (creators)
```
POST /api/payments/withdraw
Auth: required
Body: { "amount": number }
```

---

#### Withdrawal History (creators)
```
GET /api/payments/withdrawal-history
Auth: required
```

---

### CREATOR MANAGEMENT ENDPOINTS

#### Become a Creator
```
POST /api/creator/become
Auth: required

Response: { ...updated user object, "is_creator": true }
```

---

#### Get / Update Creator Settings
```
GET   /api/creator/settings
PATCH /api/creator/settings
Auth: required
Body (all optional):
{
  "subscription_price": 2000,
  "allow_dms":          true,
  "allow_comments":     true,
  "welcome_message":    "Thanks for subscribing!"
}
```

---

#### Creator Statistics
```
GET /api/creator/statistics
Auth: required
Query: period (e.g. "7d", "30d", "all")
```

---

### APP SETTINGS ENDPOINT

```
GET   /api/settings
PATCH /api/settings
Auth: required
Body (all boolean, all optional):
{
  "push_notifications":  true,
  "email_notifications": true,
  "dark_mode":           false,
  "data_saver":          false,
  "autoplay_media":      true,
  "biometric_login":     false
}
```

---

### SEARCH ENDPOINT

```
GET /api/search
Auth: optional
Query:
  q      string (min 1 char)
  type   "all" | "users" | "creators" | "posts"  (default "all")
  page   default 1
  limit  default 20, max 50

Response:
{
  "users": [ { "id", "name", "full_name", "username", "avatar_url", "is_verified", "is_creator" } ],
  "posts": [ { "id", "creator_username", "caption", "visibility", "like_count", "published_at", ... } ]
}
```

Searches of ≥2 chars are saved to the user's recent searches (when authenticated).

---

### CATEGORIES ENDPOINT

```
GET /api/categories
Auth: not required

Response: { "categories": [ { "id", "name", "slug", "post_count" } ] }
```

---

### HEALTH ENDPOINTS

```
GET /api/healthz      → { "ok": true }      (no headers required)
GET /api/diagnostic   → full service status  (no headers required)
```

---

## Part 14 — Screen Map

### Unauthenticated screens
| Screen | Trigger |
|---|---|
| Welcome / Onboarding | First launch |
| Register | Tap "Sign Up" |
| Email Verification | After register, or after login returns `EMAIL_NOT_VERIFIED` |
| Login | Tap "Log In" |
| Forgot Password | Tap "Forgot password" on Login |
| Reset Password | After Forgot Password |

### Main tabs
| Tab | What it shows |
|---|---|
| **Home** | Mixed feed from subscribed creators + own content. Empty state if no subscriptions. |
| **Explore** | Public content feed + search + featured creators + albums |
| **Create** (+) | Bottom sheet: choose Post / Video / Short |
| **Notifications** | Activity feed |
| **Profile** | Own profile |

### Detail screens
| Screen | Notes |
|---|---|
| Post detail | Full image view, comments |
| Video player | Full-screen video player |
| Shorts player | Vertical swipe feed (TikTok style) |
| Creator profile | Header + content tabs OR subscription wall |
| Subscribe modal | Shown from creator profile for non-subscribers |
| Messages list | All conversations |
| Message thread | Chat UI for a conversation |
| Album detail | Cover, description, purchase button / item grid |
| Wallet | Balance + top-up + transaction history |
| Settings | App settings + account settings |
| Edit profile | Edit avatar, bio, username, etc. |
| Bookmarks | Saved posts |
| Search results | Users + content |

---

## Part 15 — Suggested API Client Setup

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://your-server.example.com';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Client-App-Id': 'meetsweet-mobile',
    'Content-Type': 'application/json',
  },
});

// Attach access token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'X-Client-App-Id': 'meetsweet-mobile' } }
        );
        const newToken = data.data.access_token;
        await SecureStore.setItemAsync('access_token', newToken);
        await SecureStore.setItemAsync('refresh_token', data.data.refresh_token);
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        // Refresh failed — log user out
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        // Navigate to login screen here
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

---

## Part 16 — Error Handling Reference

| HTTP Status | Meaning | What to show |
|---|---|---|
| `400` | Validation error | Field-level error message |
| `401` | Missing / expired token | Redirect to login, clear tokens |
| `403` `EMAIL_NOT_VERIFIED` | Unverified email at login | Navigate to email verification screen |
| `403` other | Forbidden / deactivated | Show error message |
| `404` | Not found | Empty state |
| `409` | Conflict (duplicate email/username) | Inline field error |
| `429` | Rate limited | "Too many attempts. Try in X seconds." (use Retry-After header) |
| `500` | Server error | Generic error message, log to crash reporter |

---

## Summary of Core Rules

1. **`X-Client-App-Id: meetsweet-mobile`** on every single request, no exceptions
2. **No per-post locking** — content is either free (public) or subscription-gated (subscribers visibility)
3. **Home feed = subscribed creator content only** — empty if no subscriptions, no fallback content
4. **Explore = public content only** — discovery surface, no subscription required
5. **Creator profiles are walled** — non-subscribers see only the header + subscribe CTA, no content
6. **Albums are a separate paid purchase** — not included in subscriptions, purchased individually with credits
7. **Shorts = `content_type === "short"` only** — never show `content_type: "video"` in the Shorts feed
8. **Email must be verified before logging in** — handle `EMAIL_NOT_VERIFIED` error code from login
9. **Upload files directly to R2** — never proxy through the server
10. **Refresh tokens silently** — users should never see a "session expired" error if the refresh token is still valid
