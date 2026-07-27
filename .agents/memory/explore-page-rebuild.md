---
name: Explore page rebuild
description: Architecture and data flow of the overhauled Explore page — hooks, data wiring, component changes, and the crash root cause.
---

## Root cause of "View Preview" crash
`app/content/[id].tsx` was using `useGetExploreCatalog` — the generated stub that hits
the non-existent `/api/explore` backend endpoint. Fixed by switching to `useLocalExploreCatalog`.
**Never import `useGetExploreCatalog` anywhere in the app.**

## Two hooks exported from `services/explore.ts`
- `useLocalExploreCatalog()` — single `useQuery`, fetches 50 posts once. Used by `content/[id].tsx`
  for id→preview/creator lookups. Keeps working even without auth.
- `useExploreFeed()` — `useInfiniteQuery` with cursor pagination. Used by the Explore tab
  video-mode FlatList. Calls `fetchExplorePosts(cursor?)` internally.

## Data wiring that was missing (now fixed)
- `ContentPreview` type extended with `thumbnailUrl`, `createdAt`, `likeCount` in `api.schemas.ts`
- `buildExploreCatalog` / `fetchExplorePosts` now populate these from raw post `media[0]`
- `VideoCardData` in `MsVideoCard.tsx` now has `thumbnailUrl` and `creatorAvatarUrl`
- `MsMediaLoader` renders the real thumbnail in video cards and preview cards
- `MsAvatar` receives `imageUri={creator.avatarUrl}` everywhere in `MsExploreVisual.tsx`
- `fmtTimeAgo(iso)` exported from `services/explore.ts` — use for all relative timestamps

## Video feed architecture (Videos mode)
- Entire screen is a `FlatList` when `viewMode === 'videos'`
- Header (search, trending, toggle, wallet, categories) is `ListHeaderComponent`
- `onEndReached` calls `feedQuery.fetchNextPage()` when `hasNextPage && !isFetchingNextPage`
- `removeClippedSubviews`, `windowSize=5`, `maxToRenderPerBatch=5` for smooth scrolling
- Creators mode keeps existing `ScrollView` with multiple sections

## Deduplication
- `fetchExplorePosts` deduplicates posts by id before processing
- Feed hook merges pages in the screen with a `Set<string>` guard on preview ids
- Creator map prevents duplicate creator entries per page

**Why:** The backend can return the same post across pages; the same creator appears in
many posts. Without deduplication the feed showed repeated cards.
