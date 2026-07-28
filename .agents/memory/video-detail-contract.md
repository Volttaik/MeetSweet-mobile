---
name: Video detail routing & player contract
description: How long-form video navigation, MsLongFormPlayer gestures, and getPost response shape work together.
---

# Video Detail Routing & Player Contract

## Rules

**Routing:** Home feed posts with `mediaType === 'video'` must route to `/videos/:id`, not `/post/:id`. All other post types route to `/post/:id`. This is enforced in `app/(tabs)/index.tsx`.

**getPost wrapper fix:** `GET /api/posts/:id` returns `{ post: {...} }` after envelope unwrap (same pattern as /users/me). `normalizePost` must receive `raw?.post ?? raw` — fixed in `services/posts.ts getPost()`.

**MsLongFormPlayer initialAspectRatio:** Pass `initialAspectRatio={post.width && post.height ? post.width / post.height : undefined}` from any screen that already has the post's dimensions. This sets the player container size before `onReadyForDisplay` fires, eliminating the layout flash.

**MsLongFormPlayer gesture zones:** Player tracks its own rendered width (`playerWidth` state via `onLayout`). Tapping the centre third (x between width/3 and 2*width/3) toggles play/pause and reveals controls. Tapping either edge toggles controls visibility only.

**Why:** These are the two most common sources of "broken video" reports: wrong destination on tap, and the initial layout jump when aspect ratio recalculates after mount.

**How to apply:** Any new screen rendering MsLongFormPlayer should pass `initialAspectRatio` if it has width/height in the data. Any new feed rendering Post items must branch on `mediaType === 'video'` for routing.
