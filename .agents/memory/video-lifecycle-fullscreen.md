---
name: Video lifecycle & fullscreen architecture
description: Background playback fix, true fullscreen, orientation handling in MsVideoPlayer/MsLongFormPlayer/videos/[id].tsx
---

## Background playback prevention

**Rule:** Any screen that hosts a video player must pass `active={screenFocused}` to `MsLongFormPlayer`.

**How it works:**
- `useFocusEffect` in `app/videos/[id].tsx` sets `screenActive` state: true on focus, false on blur.
- `MsLongFormPlayer` passes it through to `MsVideoPlayer` via the `active` prop.
- `MsVideoPlayer` has an effect: when `active === false` AND `!isShorts`, both `videoRef` and `fsVideoRef` are immediately paused.
- `MsVideoPlayer` also has an unmount cleanup that pauses both refs, clears all timers, and restores `PORTRAIT_UP` orientation lock.

**Why:** Without this, the expo-av Video element continued playing audio/video after back-navigation because nothing called `pauseAsync()` on unmount or blur.

## Fullscreen true edge-to-edge

**Rule:** `fs.root` must use `position: 'absolute', top:0, left:0, right:0, bottom:0` — NOT `flex:1`.

**Why:** On some Android builds, `flex:1` inside a Modal with `statusBarTranslucent` leaves a 1px gap because the layout engine resolves flex against the status-bar-adjusted bounds before the translucent override takes effect. Absolute positioning bypasses this.

**Status bar:** Two-layer hide — declarative `<StatusBar hidden translucent />` for iOS + imperative `StatusBar.setHidden(true, 'fade')` in a `useEffect` for Android. Restored in the effect cleanup.

**Safe area in fullscreen:** Only apply `safeBottom` to the bottom seek bar (home indicator). Do NOT apply `insets.top` to the top close button — status bar is hidden so `insets.top` may be stale on Android.

**Modal props:** `hardwareAccelerated={Platform.OS === 'android'}` added to avoid compositor artefacts.

## Orientation in fullscreen

**Rule:** Call `ScreenOrientation.unlockAsync()` on fullscreen open (allows portrait + landscape freely). Call `ScreenOrientation.lockAsync(PORTRAIT_UP)` on fullscreen close to restore app orientation.

**Why:** Locking to `LANDSCAPE` only was the previous behaviour — users couldn't watch portrait-format videos in portrait. Unlocking lets the device accelerometer decide, matching YouTube's behaviour.

## Two-player architecture note

Fullscreen uses a second Video element (`fsVideoRef`). Position is synced on open/close. Rotation within the fullscreen Modal is seamless because Modal's `supportedOrientations` resizes without remounting the Video. The brief pause on enter/exit fullscreen is inherent to this architecture; a single-player approach would require `expo-video` + portal rendering (deferred to the expo-av migration task).
