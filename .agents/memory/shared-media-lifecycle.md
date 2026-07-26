---
name: Shared media lifecycle
description: Media loading and playback behavior for the Expo frontend.
---

Images and video posters should go through the shared media lifecycle: a stable surface while loading, a 300–400ms fade on success, and a visible retry state on failure. Feed videos must remain poster-only until the user explicitly presses play; the fullscreen player keeps the poster beneath the stream until the first ready frame.

**Why:** Mounting video streams while scrolling causes unnecessary bandwidth and visible black/blank transitions, while independent image loading implementations drift in behavior.

**How to apply:** Use the shared media loader/state components for new remote media and preserve explicit play gating in feed/list contexts. Keep the custom player responsible for playback controls, scrubbing, gestures, buffering and fullscreen behavior.