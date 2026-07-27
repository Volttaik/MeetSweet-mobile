---
name: Explore Phase 3 card architecture
description: Three dedicated Explore card components replacing the old unified card approach; data types and padding conventions.
---

# Explore Phase 3 — Dedicated Card Architecture

## The rule
The Explore feed uses **three completely separate card components** — never a single unified card:
- `ExploreImageCard` — image/photo posts only; 4:5 aspect, no play button, no video UI
- `ExploreVideoCard` — video/audio posts only; 16:9 cinematic, large play button, VIDEO badge, duration
- `ExploreAlbumCard` — album collections only; tall cover + stacked fan thumbnails, COLLECTION badge

**Why:** Images were rendering with video play buttons due to a shared card component. Separate components eliminate the ambiguity permanently and allow each content type to be styled independently.

## Data types
- `ExploreImageCardData` (in `components/ExploreImageCard.tsx`): has `caption`, `likes`, `comments`, `imageUrl`
- `ExploreVideoCardData` (in `components/ExploreVideoCard.tsx`): has `title`, `likes`, `comments`, `duration`, `thumbnailUrl`, `mediaUrl`, `kind`
- Albums use `AlbumCardData` from `services/albums.ts`

## commentCount threading
`ContentPreview` in `lib/api-client-react/generated/api.schemas.ts` now has `commentCount?: number`.
`previewFromPost` in `services/explore.ts` populates it from `post.comment_count ?? 0`.
In `explore.tsx`, it is formatted as `String(p.commentCount ?? 0)` for the `comments` field.

## Padding conventions
- Image cards: `feedItemWrap` style — `paddingHorizontal: 16` (card is SCREEN_WIDTH - 32)
- Video cards: `videoItemWrap` style — `paddingHorizontal: 12` (card is SCREEN_WIDTH - 24, slightly wider for cinematic feel)
- Album cards: `feedItemWrap` style — `paddingHorizontal: 16` (card width is SCREEN_WIDTH - 32, set internally)

## How to apply
Always route to the right component:
```tsx
if (p.kind === 'video' || p.kind === 'audio') → ExploreVideoCard
else → ExploreImageCard
albums → ExploreAlbumCard
```
Never mix. Never add an `if mediaType === 'video'` branch inside an image card.
