---
name: Voice recording implementation
description: How hold-to-record voice notes work in chat, including recording, upload, and playback.
---

# Voice Recording in Chat

**Why:** Previous agent left mic button as `Alert.alert` placeholder. Full implementation added using expo-av.

## Recording
- `Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)` started on `onLongPress` (delayLongPress: 150ms)
- `Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })` called before recording
- Timer increments `recordingDuration` every second
- On `onPressOut`/release: `recording.stopAndUnloadAsync()` → get URI → `uploadMedia(uri, 'audio/m4a', ...)` → `sendMessage(…, 'audio')`
- Clips under 1 second are discarded silently

## Recording UI
- When `isRecording` is true, InputBar renders a recording pill instead of the normal input
- Red pulsing dot + "Recording… 0:00" + "Release to send"
- Red circle action button replaces normal rose mic button
- `recordingPulse` Animated.Value loops scale 1→1.2→1 while recording

## VoiceNoteBubble component (in app/chat/[id].tsx)
- Renders when `message.mediaType === 'audio'`
- Play/Pause toggle using `Audio.Sound.createAsync({ uri }, { shouldPlay: true }, statusCallback)`
- 22 pre-computed bar heights (`VOICE_BARS`) — seeded by sin/cos to avoid re-render flicker
- Progress fills bars left→right based on `position / duration`
- Own-bubble: rose background, white bars; other-bubble: SURFACE background, accent-colored active bars

## ChatMessage type extension (services/messages.ts)
- `mediaType: 'image' | 'video' | 'audio' | null`
- `audioDuration?: number` — seconds; stored locally since backend doesn't echo it

## Constraints
- `audioDuration` is preserved on the optimistic message and the server-confirmed message manually (backend returns no audio duration)
- expo-av deprecation warning is expected in SDK 54 — do not replace until SDK 55 migration

**How to apply:** Any new screen showing messages must render `VoiceNoteBubble` when `message.mediaType === 'audio'`.
