---
name: Messaging rebuild
description: Complete chat screen rebuild — animated input, bottom sheets, SQLite caching. What was done, what's still needed.
---

# Messaging Experience Rebuild

## What was built

### `app/chat/[id].tsx` — complete rebuild
- Animated input bar: pill shape (50px radius), no border/outline, expands vertically without cap.
- Camera icon slides away (Animated.Value width→0) when text is non-empty.
- Mic ↔ Send animated transition (opacity + scale) on the right action button.
- Reply preview bar (`ReplyBar`) animates in above the input when replying.
- Long-press sheet (`LongPressSheet`): quick reactions + Reply / Copy / Delete / Forward / Info.
- No avatars beside messages — only in the header.
- Header: back, avatar, name, "Tap for info" status, voice call, video call, menu.
- Offline banner shown when SQLite cache is used.
- Message bubbles with appear animation (fade + spring scale), timestamp inside bubble.

### `components/MsEmojiPicker.tsx`
- Animated bottom sheet (spring slide-up).
- 10 categories with categorized emoji grids.

### `components/MsGifPicker.tsx`
- Animated bottom sheet with GIPHY search.
- Requires `EXPO_PUBLIC_GIPHY_API_KEY`; shows honest "unavailable" UI without it.

### `components/MsAttachmentSheet.tsx`
- Animated bottom sheet.
- Images / Videos (expo-image-picker) and Camera work; Audio/Document/Location show coming-soon alerts.

### `services/chat-cache.ts`
- expo-sqlite@16.0.10 (compatible with Expo SDK 54).
- Tables: conversations, messages, auth_cache, drafts.
- Falls back to AsyncStorage on web (Platform.OS === 'web').
- cacheConversations, getCachedConversations, cacheMessages, getCachedMessages, deleteCachedMessage, saveDraft, getDraft.

## What still needs work
- Voice note recording (placeholder alert only).
- Real-time presence / "Online" status.
- GIF search needs EXPO_PUBLIC_GIPHY_API_KEY env var set.
- Reply-to is tracked on UI only; not sent to backend (backend support unknown).
- Forward message to another conversation not implemented.
- Document sharing (expo-document-picker) not wired.
- Biometric preference caching (auth_cache table created, not populated).

## Key constraints
- expo-sqlite must stay at ~16.0.10 (Expo SDK 54 expects ~16.0.10, not 57.x).
- Animated API used (not Reanimated) for all input bar transitions to avoid web compat issues.
- Bottom sheets use Modal + Animated.Value — no external sheet library (avoids gorhom crash).
