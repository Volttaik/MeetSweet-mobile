---
name: MeetSweet micro-interactions system
description: Reusable interaction components added for confirmations, toasts, and screen-level micro-features.
---

## Core reusable components

### MsConfirmDialog (`components/MsConfirmDialog.tsx`)
Modal confirmation dialog for all destructive/irreversible actions. Replaces `Alert.alert` patterns.
```tsx
<MsConfirmDialog
  visible={bool}
  title="Delete post?"
  message="This cannot be undone."
  confirmLabel="Delete"
  destructive   // red confirm button
  onConfirm={fn}
  onCancel={fn}
/>
```
**Why:** Consistent, on-brand confirmation UI instead of native OS alerts.

### MsToast (`components/MsToast.tsx`)
Global imperative toast notification system. `MsToastHost` is rendered once in `app/_layout.tsx` inside `AuthProvider`.
```tsx
// Imperative call anywhere in the app — no import of component required
import { toast } from '@/components/MsToast';
toast.success('Saved!');
toast.error('Something went wrong');
toast.info('Copied to clipboard');
```
**Why:** Feedback for non-blocking actions (copy, mute, archive) that don't need a full dialog.

### MsActionSheet (existing, extended)
Already the standard for all context menus. Used in:
- `MsPostCard` — long-press post (own: share/edit/archive/delete; guest: save/share/copy/not-interested/mute/report)
- `app/(tabs)/messages.tsx` — long-press conversation
- `app/(tabs)/explore.tsx` — long-press creator
- `app/chat/[id].tsx` — long-press message + header dots menu
- `app/post/[id].tsx` — long-press/dots comment menu
- `app/settings.tsx` — notification prefs, privacy settings

---

## Screen-level micro-features added

### Profile (`app/(tabs)/profile.tsx`)
- Avatar: tap → full-screen viewer; long-press → sheet (View / Change / Remove)
- Banner: tap → sheet (View / Change / Remove); inline `ImageViewer` modal
- Share profile button → `Share.share()`
- Long-press username → `Share.share()` as copy workaround
- "Edit Profile" button opens an inline modal
- Profile and banner photos upload through the shared media endpoint, then persist through the user update API
- Grid post tiles wired → `/post/:id`

### Post detail (`app/post/[id].tsx`)
- Comment long-press + dots → `MsActionSheet` (own: Edit/Copy/Delete; guest: Reply/Mention/Copy/Report)
- Edit flow: inline composer bar replaces `Alert.prompt`
- Delete → `MsConfirmDialog`
- Share button in header → `Share.share()`
- Cancel reply now also clears draft text

### Chat (`app/chat/[id].tsx`)
- Message long-press → `MsActionSheet` (own: Copy/Reply/Delete; other: Copy/Reply/Report)
- Header DotsThree → `MsActionSheet` (Mute/Search/Mark Unread/Archive/Delete conversation)
- Delete message → `MsConfirmDialog`
- Delete conversation → `MsConfirmDialog`

### Settings (`app/settings.tsx`)
- All account, privacy, notification, content, security, and support actions open inline bottom sheets or switches; settings should not navigate to separate sub-screens
- Edit Profile, Username, Change Password, biometrics, active sessions, login history, 2FA, privacy permissions, language, support, and delete-account flows use modal components
- Log out and delete account use `MsConfirmDialog`
- API-backed edits use the current service contracts and show `toast.*` feedback; unsupported backend endpoints must remain explicit rather than silently succeeding

### Post card (`components/MsPostCard.tsx`)
- Delete post → `MsConfirmDialog`
- Report post → `MsConfirmDialog`
- Share post → `Share.share()`
- Copy link → `Share.share()` (opens native share sheet which includes Copy)
- "Save Post" / "Remove Saved" label toggled based on `bookmarked` state

### Create post (`app/create-post.tsx`)
- Back button guard: if caption or media present, `Alert.alert` discard confirmation

---

## Patterns & rules

- `Share.share()` from `react-native` is the clipboard workaround — no extra package needed.
- `ImagePicker` from `expo-image-picker` is used for avatar/banner picking (already in deps).
- Destructive confirmation always uses `MsConfirmDialog`, not `Alert.alert`.
- Non-blocking feedback uses `toast.*`.
- Context menus always use `MsActionSheet`.
- `MsToastHost` must remain inside `AuthProvider` in `app/_layout.tsx`.

**Why:** Ensures one consistent interaction vocabulary across all screens. Future agents should extend this system rather than create new patterns.
