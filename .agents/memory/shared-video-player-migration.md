---
name: Shared video player migration
description: Status and rules for the unified MsVideoPlayer migration — which surfaces are migrated and what patterns to follow.
---

# Shared video player migration

## Rule
Every video playback surface must use `MsVideoPlayer` (`components/MsVideoPlayer.tsx`).
Raw `expo-av` `Video` imports are only allowed inside `MsVideoPlayer` itself and `MsVideoThumbnail` (first-frame extraction, not playback).

## Completed surfaces
| Surface | Component / file | Pattern |
|---|---|---|
| Long-form watch | `app/videos/[id].tsx` | `MsLongFormPlayer` → `MsVideoPlayer mode="standard"` |
| Content detail | `app/content/[id].tsx` | `MsLongFormPlayer` → `MsVideoPlayer mode="standard"` |
| Shorts feed | `app/shorts/index.tsx` | `MsShortsPlayer` → `MsVideoPlayer mode="shorts"` |
| Chat fullscreen | `app/chat/[id].tsx` (~line 2051) | `Modal` + `MsVideoPlayer fillContainer onClose` |
| Chat video bubble | `app/chat/[id].tsx` (~line 568) | `MsVideoThumbnail` (thumbnail only, tap→fullscreen) |
| Premium content inline | `components/MsPremiumContent.tsx` | `MsVideoPlayer autoPlay fillContainer mode="standard"` inside `View style={absoluteFill}` |
| Attachment preview | `components/MsAttachmentPreview.tsx` | `MsVideoPlayer fillContainer mode="standard"` inside `s.videoWrap` |

## MsVideoPlayer props added during migration
- `onClose?: () => void` — when `fillContainer=true`, renders a top-left close/back button in the controls overlay (safe for wrapping inside a Modal)
- `fillContainer=true` auto-hides the internal fullscreen button (`showFullscreen={!fillContainer}`) to prevent modal-within-modal

**Why:** Prevents redundant fullscreen nesting when the player is already filling a full-screen Modal.

## How to apply
- Any new video surface: use `MsVideoPlayer` with appropriate `mode` and props.
- Inside a fullscreen Modal: use `fillContainer={true}` + `onClose={closeHandler}`.
- For static video thumbnails (no playback): use `MsVideoThumbnail`.
- Never add a new `import { Video } from 'expo-av'` outside `MsVideoPlayer.tsx` or `MsVideoThumbnail.tsx`.

## Known remaining work
- `expo-av` → `expo-video` migration (deferred; see task #3)
- `MsVideoThumbnail` needs an error fallback for unreachable URLs (see task #2)
- Feed-level single-active-video coordinator (see task #4)
