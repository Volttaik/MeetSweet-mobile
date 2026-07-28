---
name: Profile system completion
description: Architecture decisions and backend notes from the profile system & UX pass
---

## Profile screen tab architecture
- **Posts tab** → `MsPostCard` full-card list (same as home feed), NOT a grid
- **Media tab** → 3-column grid with `MsMediaLoader` tiles, video play badge + duration, lock badge
- **Saved tab** → `MsPostCard` full-card list

## Post actions wiring
- `MsPostCard` now has `onEditPress?: (post) => void` and `onAnalyticsPress?: (post) => void` props
- These replace the previously empty `ownActions` stubs in the component
- Profile screen passes these to open `EditPostSheet` / `AnalyticsSheet` inline modals

## Analytics
- No dedicated analytics endpoint exists; uses `getPost(id)` for fresh stats
- Shows: Likes (like_count), Comments (comment_count), Saves (save_count)
- View count not yet in backend response — shown only when backend adds it

## content_type now sent to createPost
- `CreatePostData` interface now has `content_type?: 'post' | 'video' | 'short' | 'album'`
- create-post.tsx maps videoContentType → content_type before calling createPost

## Banner uses MsMediaLoader
- Profile banner replaced plain `Image` → `MsMediaLoader` (same shimmer/fade/retry)
- Avatar already used MsAvatar → MsMediaLoader

## Settings backend reality
- **Real backend calls**: password change, biometric toggle, username change, name/bio edit
- **AsyncStorage only** (backend doesn't support): privacy prefs, per-type notification prefs, content prefs
- **Backend-blocked, documented**: email change, phone change, 2FA
