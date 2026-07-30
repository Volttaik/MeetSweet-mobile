---
name: Video player loading/UX rules
description: Durable UX rules for the shared video player's loading and overlay behavior; read before touching buffering, spinners, or modal auto-hide logic.
---

- A playback engine's buffering flag can lag one frame behind its playing flag. Never trust the buffering flag alone to decide whether to show a loading overlay — the moment playback is confirmed to have started, that fact must override any stale "still buffering" signal for that same update, or the loader will visibly stick over a playing video.
- Video loading states across the app use skeleton shimmer, not spinners — keep any new loading UI consistent with that.
- A modal's own auto-dismiss timer must never race the parent screen's control auto-hide timer. If a sub-popup (e.g. an orientation/settings picker) needs to stay open indefinitely, the parent must be told to suspend its own auto-hide while the popup is open, and resume it only after the popup closes.
