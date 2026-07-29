---
name: Video player architecture audit
description: Final audit results for the video/media layer — what's clean, what was fixed, what's deferred.
---

# Video Player Architecture — Audit Results (July 2026)

## Current clean state

**MsLongFormPlayer** (`components/MsLongFormPlayer.tsx`)
- Uses `expo-av` Video with `useNativeControls` only.
- No custom controls, no gesture zones, no bottom gradient or overlay of any kind.
- Only overlays: poster (behind video, via MsMediaLoader), error state, premium gate.
- `shouldPlay={autoPlay && !premiumGated}` is the single source of truth for initial play.
- Premium gate re-enforcement via `pauseAsync()` in `onPlaybackStatusUpdate` is intentional and correct.

**MsShortsPlayer** (`components/MsShortsPlayer.tsx`)
- `useNativeControls={false}` — fully custom immersive layout.
- `shouldPlay={active && !premiumGated}` drives scroll-based play/pause.
- Imperative `pauseAsync()`/`playAsync()` drive user taps — no conflict because `shouldPlay` does NOT change on tap, only on scroll (active changes).
- Centre icon animates in/out with Reanimated. Slim 3px progress bar at bottom edge.

**MsAttachmentPreview** (`components/MsAttachmentPreview.tsx`)
- Video: `shouldPlay` intentionally OMITTED. Imperative calls only. `setVideoPlaying` is ONLY updated via `onPlaybackStatusUpdate`, never optimistically in press handlers.

**MsPremiumContent** (`components/MsPremiumContent.tsx`)
- Inline video: `shouldPlay={true}` when mounted (only mounts after play tap). Native controls handle pause/resume after that. Since `shouldPlay` never changes value post-mount, no dual-control conflict.

## Fixed in this session

**MsPostCard** (`components/MsPostCard.tsx`) — video block:
- Added `onPlayPress={onMediaPress ?? onPress}` to the MsPremiumContent for video posts.
- Added `onPress={onMediaPress ?? onPress}` to the wrapping TouchableOpacity.
- Before this fix, tapping the play icon in the feed would start inline playback instead of routing to `/videos/:id`. This violated the "one active playback controller" principle and created the dual-control issue (shouldPlay=true on re-render could resume native-paused video).

**MsVideoPlayer** (`components/MsVideoPlayer.tsx`) — removed dead prop:
- Removed `posterUri?: string | null` from interface. Was documented as unused and kept only for API compatibility. No callers pass it.

## Architecture decisions (do not revert)

- Bottom overlay on MsLongFormPlayer: confirmed NOT present. Was removed in a prior session.
- Seek bar tint on native controls: NOT supported by expo-av VideoProps. Do not implement workarounds.
- Native fullscreen: handled by the OS through useNativeControls. No custom fullscreen route needed for long-form videos.
- Shorts: must never use native controls. Custom immersive layout is intentional.

## Deferred — expo-av deprecation

All five video components use `expo-av` (deprecated in SDK 54+):
- MsLongFormPlayer, MsShortsPlayer, MsVideoPlayer, MsPremiumContent, MsAttachmentPreview, MsVideoThumbnail, app/chat/[id].tsx

`expo-video` is NOT currently installed. Migration requires a significant API rewrite (VideoView vs Video, useVideoPlayer hook, different status model). Defer to a dedicated migration task.

**Why:** expo-av SDK 16 still works on the current SDK. Rushing the migration mid-feature risks regressions. A focused migration task can do it safely.
