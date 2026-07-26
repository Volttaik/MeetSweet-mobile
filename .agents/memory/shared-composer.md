---
name: Shared composer (MsComposer + MsVideoPlayer)
description: MsComposer replaces raw TextInput in comments/DMs; MsVideoPlayer is the fullscreen video modal.
---

# MsComposer

`components/MsComposer.tsx` — shared input for comments and DM (future).

Props:
- `mode: 'comment' | 'dm'`
- `value`, `onChangeText`, `onSend`
- `disabled?: boolean`
- `replyTo?: { authorName: string; onDismiss: () => void } | null`

**Integration:** `app/post/[id].tsx` imports and uses it. Replace any raw `TextInput` comment composer with `<MsComposer mode="comment" ... />`.

**Note:** Do NOT spread `Platform.OS === 'web'` props into JSX props — use conditional style objects on the `style` prop instead. The Babel transformer rejects object spreads inside JSX on the Expo Metro bundler.

# MsVideoPlayer

`components/MsVideoPlayer.tsx` — fullscreen `expo-av` Video modal.

Props: `visible: boolean`, `uri: string`, `onClose: () => void`

Features: custom controls bar, double-tap ±10s seek, `supportedOrientations={['portrait','landscape']}`, seek scrubber.

**Integration:** `app/components/MsPostCard.tsx` renders it when the user taps the expand icon on non-locked video posts.

**Warning:** expo-av is deprecated as of SDK 54. Migrate to `expo-video` in a future sprint.
