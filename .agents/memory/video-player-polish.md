---
name: Video player polish
description: Changes made during Task #2 — spinner silencing, native controls removal, rounded corners, explore spacing.
---

## Rules

**Buffering spinner is silenced once playback starts.**
- `MsVideoPlayer`: buffering ring on centre button and bufferingDot only show when `mediaState !== 'success'`. After `onReadyForDisplay` fires, no buffering UI ever again.
- `MsLongFormPlayer`: mid-playback buffering spinner block removed entirely. Only the initial `!isReady` spinner shows.
- `MsShortsPlayer`: `hasEverPlayedRef` added — `ActivityIndicator` suppressed once that ref is true (set in `onReadyForDisplay` when active).

**Why:** Spec requires "never display spinner once playback has begun, even during subsequent buffering."

**Native controls**
- All `Video` components explicitly use `useNativeControls={false}`.
- `MsAttachmentPreview` was the only offender (bare `useNativeControls` = true in JSX). Replaced with `useNativeControls={false}` + a custom play/pause overlay button using a `ref` on the Video.

**Rounded corners**
- `MsLongFormPlayer` `playerFill` style now includes `borderRadius: 0` — overrides the base `player` borderRadius so fullscreen (fillContainer=true) has no rounded corners.
- `MsPostCard` passes `borderRadius={T.RADIUS.xl}` (20) explicitly to both image and video `MsPremiumContent` instances.
- `MsVideoCard` card already had `borderRadius: T.RADIUS.xl` via its own style.

**Explore spacing**
- `feedItemWrap` and `videoItemWrap` `paddingBottom` bumped from 16 → 22 in `app/(tabs)/explore.tsx`.

**Pre-existing bug fixed**
- `Play` and `Pause` were missing from `MsLongFormPlayer`'s phosphor-react-native import (caused TS error, now added).
