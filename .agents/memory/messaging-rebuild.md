---
name: Messaging rebuild
description: Complete rebuild of chat screen — input bar sizes, voice recording, SQLite cache, offline banner.
---

# Messaging (chat/[id].tsx) — input bar sizing

The chat InputBar pill/icon/button sizes were scaled up for WhatsApp-like feel:

- `pill.minHeight`: 36 → 50
- `pillIcon` dimensions: 30×30 → 38×38
- `actionBtn` dimensions: 36×36 → 44×44, borderRadius 18→22
- `actionBtnRecording` dimensions: 40×40 → 48×48, borderRadius 20→24
- `row.paddingVertical`: 6 → 10, `paddingHorizontal` 8→12, `gap` 6→8
- Icon sizes inside pill: 20 → 22; inside send/mic button: 18 → 20
- `recText` font size: 14→15; `recHint`: 11→12

**Why:** The original sizes were too small for comfortable thumb typing. Consistent with WhatsApp/iMessage ergonomics.

**How to apply:** When adjusting any chat UI sizes, update the `ib` StyleSheet constants (local stylesheet around lines 873-963 in `app/chat/[id].tsx`).
