---
name: Explore page rebuild
description: YouTube-style video feed, mode toggle, new components, swipe-to-close modal.
---

# Explore page rebuild

## Mode toggle
`app/(tabs)/explore.tsx` has a `ViewMode = 'creators' | 'videos'` state.
- **Creators mode** — existing marketplace (featured, recommended, premium previews, collections, recently joined).
- **Videos mode** — vertical feed of `MsVideoCard` components built from `ContentPreview` API data + matched `Creator`.

## New components
- `components/MsVideoCard.tsx` — YouTube-style card: thumbnail area (gradient + abstract lines), play button or lock overlay (for `isPremium`), duration badge, kind badge, creator identity row, metadata row (views, upload date). Accepts `VideoCardData` interface.
- `components/MsCommentsSheet.tsx` — inline preview (`MsCommentsSection`) shows first 2 comments + "View all" button. Full `CommentsModal` is a bottom-sheet with `FlatList` + pinned `MsComposer` in comment mode.

## MsModal swipe-to-close
`components/MsModal.tsx` uses `PanResponder` + `Animated.Value` translateY on the sheet surface. Drag > 80px triggers a snap-down animation then `onClose()`. Drag < 80px springs back. Center-presentation modals skip the gesture.

## VideoCardData to ContentPreview mapping
`makeVideoCard(preview, creator, index)` in explore.tsx enriches ContentPreview with mock view counts and upload dates (round-robin from static arrays) since the API doesn't return these fields.

**Why:** ContentPreview has no viewCount or uploadDate; these are placeholder values until the API adds them.

**How to apply:** When the API adds real view/date fields, update `makeVideoCard` to read them directly instead of the round-robin arrays.
