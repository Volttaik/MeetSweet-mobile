---
name: Video player enhancements
description: MsVideoPlayer added speed selector, long-press 2×, resize mode toggle, and buffering scrubber indicator.
---

# Video player enhancements

## Rule
`MsVideoPlayer` (`components/MsVideoPlayer.tsx`) is the fullscreen player used by `MsPostCard`. It uses `expo-av` (not `expo-video`).

## What was added
- **Speed selector** — `SPEED_OPTIONS` [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]. Tap the `Gauge` icon in the top-right to open the dropdown overlay. Uses `setRateAsync(s, true)` (pitch-corrected).
- **Long-press centre button → 2× while held** — saves pre-longpress speed, restores on `onPressOut`. Guarded by `isLongPressingRef` to prevent double-fire.
- **Resize mode toggle** — `ArrowsOut` button in top-right toggles `ResizeMode.CONTAIN` ↔ `ResizeMode.COVER`. Also toggles on 2-finger touch release.
- **Buffering indicator on scrubber** — a semi-transparent `scrubBuffering` bar renders just ahead of the playhead when `isBuffering` is true.
- **Speed menu closes** on pressing the backdrop `Pressable` covering `StyleSheet.absoluteFill`.

## Why
The original player had no speed control, no resize toggle, and no buffering feedback on the timeline.

## How to apply
When adding new player controls, always check `showSpeedMenu` state — controls overlay is hidden when speed menu is open to prevent overlap. The top-right button row uses `topRight` flex row; add new icon buttons there.
