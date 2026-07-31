---
name: Chat system rebuild
description: Architecture of the rebuilt chat system using @kesha-antonov/react-native-chat as the foundation layer.
---

# Chat System Rebuild

## Summary
The chat UI was rebuilt on `@kesha-antonov/react-native-chat` (v4.1.0) with `@shopify/flash-list` as a peer dep. The library's `Chat` component handles message list virtualization, keyboard avoidance, swipe-to-reply, reactions, date separators, and typing indicators. All backend wiring uses the existing MeetSweet services (services/messages.ts, services/media.ts).

## Key decisions

- **MsMessage extends IMessage** from the library. Bridge lives in `types/chat-message.ts` with `toMsMessage()` and `toReplyMessage()` helpers.
- **renderBubble** completely overridden by `MsChatBubble` which routes to sub-components by type.
- **renderInputToolbar** completely overridden by `MsChatInputBar` — the library's Composer/InputToolbar are not used.
- **renderDay** overridden by `MsDateSeparator`.
- **disableKeyboardProvider: true** — prevents nesting of KeyboardProvider since app may already have one.

## Shared components (components/chat/)
- `MsTextBubble` — pill shape, ~50px border radius, own=accent, other=surface_2
- `MsMediaCard` — ~5px border radius cards for images/videos
- `MsVoiceBubble` — pill with 22-bar waveform + expo-av playback + speed cycle
- `MsFileCard` — doc card with icon, filename, size, download button
- `MsPaidOverlay` — absoluteFill blur+lock for locked paid content
- `MsChatBubble` — main router dispatching to above components
- `MsChatInputBar` — full input: emoji, attach, voice record (hold mic), text, send
- `MsReactionStrip` — emoji reaction pills below bubbles
- `MsReplyPreviewBubble` — quoted message context above bubble
- `MsTypingIndicator` — 3 bouncing dots in pill bubble
- `MsDateSeparator` — floating date badge

## Library API gotchas

- `loadEarlier*` props do NOT exist on `Chat`; use `loadEarlierMessagesProps={{ isAvailable, onPress, isLoading }}`
- `ReactionsProps.emojis` (not `.reactions`) sets the emoji list; `isEnabled: true` is required
- `DayProps.createdAt` is a `Date | number` directly — no `.currentMessage`
- `sendMessage` in services/messages.ts is positional: `(conversationId, body?, mediaUrl?, mediaType?, opts?)`
- `deleteCachedMessage` takes only `messageId` (no conversationId)
- `MsAvatar` uses `imageUri` prop (not `avatarUrl`)
- `MsAttachmentSheet` uses `onResult` callback (not `onAttachmentPick`)
- `MsAttachmentPreview` has no `visible` prop; uses `onSend`/`onCancel` (not `onConfirm`)
- `MsUserProfileSheet` uses `onFollow`/`onUnfollow` separately (not `onFollowToggle`)
- `MsVideoPlayer` requires `videoId` string prop in addition to `uri`

## Incomplete (follow-up tasks proposed)
- Reactions are optimistic-only; no backend sync yet
- Typing indicator is static (no WebSocket/polling)
- Audio/document messages silently lose their media_type on backend (backend limitation)

**Why:** Library's API surface is different from Gifted Chat; the gotchas above are non-obvious and caused TypeScript errors during the rebuild.
