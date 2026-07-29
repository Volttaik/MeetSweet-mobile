---
name: Video watch page architecture
description: How the /videos/[id] screen is structured after the YouTube-style rebuild.
---

The video watch page (`app/videos/[id].tsx`) is a YouTube-style scroll layout — NOT fullscreen.

**Layout (top to bottom):**
1. Fixed top bar (48px) with back button — sits above the ScrollView
2. `MsLongFormPlayer` in aspect-ratio mode (no `fillContainer`) — native controls, autoPlay
3. Title + upload date (`meta` section)
4. Action bar (Like / Comment / Save / Share) — pill card from `T.SURFACE`
5. Creator card — avatar, name, handle, Subscribe button → `/creator/[id]`
6. Comments preview — taps open `MsContentComments`
7. Related videos — from `useLocalExploreCatalog`, rendered as `MsFeedVideoCard` list

**Why:** Previous version used `fillContainer` (pure fullscreen). The new design matches the YouTube watch pattern: video stays visible while metadata and related content scroll below it.

**How to apply:** Always keep the player in aspect-ratio mode on this screen. Use `fillContainer` only if a dedicated fullscreen-only screen is needed in the future.

---

## Post-card video gesture change

`components/MsPostCard.tsx` — video block no longer uses `ScalePressable` with double-tap. It uses a plain `TouchableOpacity` (long-press only for action sheet). The native Expo player handles all video gestures.

Images still use `ScalePressable` with double-tap to like / navigate.

## Home feed navigation for videos

`app/(tabs)/index.tsx` — `onMediaPress` for video posts now routes to `/videos/[id]` (not `/post-media`). The `/post-media` route is image-only; if a video lands there it redirects to `/videos/[postId]`.

## Deleted dead components

`components/ExploreVideoCard.tsx` and `components/MsVideoCard.tsx` — removed. `MsFeedVideoCard` is the single canonical video card.
