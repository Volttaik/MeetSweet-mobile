---
name: Long-form player v2 architecture
description: MsLongFormPlayer now uses outer Pressable as gesture surface, supports fillContainer mode, creator overlay, and comments button.
---

# Long-form Player v2 Architecture

## Rule
`MsLongFormPlayer` uses an outer `Pressable` (not a separate absoluteFill Pressable overlay) as the single gesture capture surface. Child buttons absorb their own taps; the parent Pressable only fires on empty-space taps.

**Why:** Previous absoluteFill Pressable + `pointerEvents="box-none"` overlay combination had unreliable hit-testing when inside a ScrollView. The outer-Pressable pattern is more reliable across platforms.

**How to apply:** If adding new interactive elements to the player, place them inside the controls `Animated.View` with `pointerEvents="box-none"`. The outer Pressable handles all background taps.

## Key new props (all optional, backward compatible)
- `fillContainer?: boolean` — flex:1 instead of aspectRatio sizing; used in video detail and PostFullView
- `creator?: LongFormCreator` — compact overlay strip (avatar, name, username, subscribe button)
- `onCommentsPress?: () => void` — pauses video first, then calls; shown as ChatCircle in top-right
- `commentCount?: number` — badge on the comments button

## Gesture contract
- Centre tap (middle third): play/pause only + brief icon flash — NO control toggle
- Edge tap (left/right third): toggle controls visibility
- Controls auto-show on mount + play-start, fade after 1.5s

## Post Full View
New route: `app/post-media.tsx`
- Params: `uri`, `type` ('image'|'video'), `postId`, `aspectRatio` (string)
- Images: full-screen `Image` with contain + back button
- Videos: `MsLongFormPlayer` with `fillContainer` + `autoPlay`
- No comments, likes, creator panel, or recommendations

## Navigation changes
- `MsPostCard` has new optional `onMediaPress` prop: media-area taps use this; falls back to `onPress`
- Home feed (`app/(tabs)/index.tsx`): media taps → `/post-media`; caption/comment taps → `/post/[id]`
- Profile grid (`app/(tabs)/profile.tsx`): grid tiles with media → `/post-media`
- Videos from dedicated feeds still route to `/videos/[id]` (full experience)
