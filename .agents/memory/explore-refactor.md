---
name: Explore tab refactor
description: Architecture decisions made during the Explore experience polish pass.
---

# Explore tab refactor

## Rules

**ViewMode is now `'explore' | 'creators' | 'albums' | 'shorts'`** — not the old `'creators' | 'content' | 'albums'`.
- Default tab is `'explore'` (the primary mixed-content discovery feed).
- `'shorts'` does NOT render inline content; it immediately calls `router.push('/shorts')`.

**Discovery Hub is dead** — `DiscoveryHubLinks` component and `hubStyles` were deleted. Do not re-introduce any "choose your experience" intermediate hub.

**Category filters are dead** — `CREATOR_CATEGORIES`, `CONTENT_CATEGORIES`, `ALBUM_CATEGORIES`, `activeCategory` state, `creatorMatchesCategory()`, and all chip UI were removed. Do not re-add category or trending-tag chips to the Explore screen.

**Why:** The old system required users to navigate through a hub before reaching content, and category chips cluttered the header without real backend support for filtering.

## MsLongFormPlayer dynamic aspect ratio

`onReadyForDisplay` is used to capture `naturalSize.width / naturalSize.height` and update `aspectRatio` state. The player renders with `style={{ aspectRatio }}` (dynamic) rather than the old hardcoded `16/9`. Falls back to 16/9 while loading.

**Why:** Portrait videos were vertically compressed; landscape videos wasted space.

## Video content architecture

- Post videos (from `/api/posts`): `ExploreVideoCard` → `/content/${id}` (content detail screen)
- Long-form videos (from `/api/videos`): `videos/index.tsx` → `MsLongFormPlayer` in `videos/[id].tsx`
- These are different content types and use different routes intentionally.
- `MsLongFormPlayer` is the canonical player for long-form content.
- `MsPremiumContent` is for inline post media in the home feed.
- Do NOT merge these into one component.

## Upload flow

`create-post.tsx` already has `VideoTypeModal` that shows Short vs Long-form Video when a video is selected. The 3-second premium preview gate is implemented in `MsLongFormPlayer` via the `isPremium` prop.
