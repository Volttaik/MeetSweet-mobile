---
name: Video player polish
description: Video player polish decisions — overlay removal, play/pause reliability, native controls state management.
---

## Rules

**Buffering spinner is silenced once playback starts.**
- `MsVideoPlayer`: buffering ring on centre button and bufferingDot only show when `mediaState !== 'success'`. After `onReadyForDisplay` fires, no buffering UI ever again.
- `MsLongFormPlayer`: mid-playback buffering spinner block removed entirely. Only the initial `!isReady` spinner shows.
- `MsShortsPlayer`: `hasEverPlayedRef` added — `ActivityIndicator` suppressed once that ref is true (set in `onReadyForDisplay` when active).

**Why:** Spec requires "never display spinner once playback has begun, even during subsequent buffering."

**Native controls**
- `MsLongFormPlayer`, `MsShortsPlayer`, `MsVideoPlayer`, `MsPremiumContent` all use `useNativeControls={true}` (the default).
- `MsAttachmentPreview` keeps `useNativeControls={false}` with a custom play/pause overlay (no native bar inside the attachment preview sheet).

**Bottom overlay — Shorts scrim removed**
- `app/shorts/index.tsx` previously had `<View style={styles.scrim}>` (`absoluteFillObject`, `rgba(0,0,0,0.16)`) over the video.
- This was removed. Creator name / caption have text shadows for readability without the scrim.
- `MsLongFormPlayer` has no artificial bottom overlay. The native controls bar is native OS UI.

**seek bar tint colour**
- `expo-av` `VideoProps` has no official tint/progress-colour prop. Theming the native seek bar is unsupported. Leave as native OS default — do not add workarounds.

**Play/pause reliability — dual-control anti-pattern**

Two patterns cause stuck playback and must be avoided:

1. **Declarative + imperative conflict in MsShortsPlayer.**
   - `shouldPlay={active && !premiumGated}` is the single source of truth for play/pause.
   - The `useEffect` that watches `active` must NOT also call `playAsync()`/`pauseAsync()` — those race against the prop update.
   - Only keep view-progress tracking (`startedAt`) in that effect.
   - Premium-gate re-enforcement `pauseAsync()` inside `onPlaybackStatusUpdate` is still correct because it operates outside the normal state cycle.

2. **Optimistic state toggle in MsAttachmentPreview.**
   - `shouldPlay` prop is omitted (defaults to false) — imperative calls are the only control path.
   - `setVideoPlaying(v => !v)` must NOT be called in the press handler. `onPlaybackStatusUpdate` is the single source of truth for `videoPlaying` state. This prevents the UI from drifting ahead of actual native state.

**Why:** When both `shouldPlay` prop and `playAsync()`/`pauseAsync()` target the same video, they can fire in the same commit cycle in opposite order, leaving the native player in an indeterminate state. Pick one control path per video component.

**Rounded corners**
- `MsLongFormPlayer` `playerFill` style includes `borderRadius: 0` — overrides the base `player` borderRadius so fullscreen (fillContainer=true) has no rounded corners.
- `MsPostCard` passes `borderRadius={T.RADIUS.xl}` (20) explicitly to both image and video `MsPremiumContent` instances.

**Explore spacing**
- `feedItemWrap` and `videoItemWrap` `paddingBottom` bumped from 16 → 22 in `app/(tabs)/explore.tsx`.
