---
name: Feature completion 2026-07-25
description: All new screens and components added in the feature completion session. Use this to avoid duplicating work or missing context when extending these features.
---

## New components

### `components/MsLockedContent.tsx`
Reusable locked/premium content overlay. Props: `previewUri`, `price`, `label`, `onUnlock`, `unlocked`, `height`, `borderRadius`, `showPremiumBadge`, `style`. Animated pulse on the lock icon. No download button. Use everywhere premium content needs protection.

### `components/MsSearchModal.tsx`
Full-screen search modal for the Home feed. Uses `getFeed()` to search posts client-side (filters by caption/author). Stores recent searches in `@ms_recent_searches` AsyncStorage key. User search requires `GET /users/search` backend endpoint (see BACKEND_REQUIRED.md). Wired to Home screen search button.

## New screens

### `app/privacy-settings.tsx`
Dedicated Privacy settings screen with animated switches. Settings stored in `@ms_privacy_prefs` AsyncStorage key. All toggles persist immediately. When `PATCH /users/me` is live, each toggle should also call `updateMe()`.

### `app/notification-settings.tsx`
Dedicated Notifications screen with channel + activity toggles. Settings stored in `@ms_notif_prefs` AsyncStorage key. 

### `app/security-settings.tsx`
Dedicated Security screen with: Change Password (inline sheet calling `POST /auth/change-password`), 2FA info, biometric toggle (local), session management info. Sign-out-all calls `POST /auth/logout-all`.

### `app/creator-payout.tsx`
Creator payout screen. Fetches real balance from `GET /wallet`. Withdrawal request calls `POST /creator/withdraw` (documented in BACKEND_REQUIRED.md, not yet implemented). Shows transaction history with status badges.

## Updated screens

### `app/(tabs)/index.tsx`
Search button now opens `MsSearchModal` via `searchVisible` state.

### `app/creator-dashboard.tsx`
Rewritten with real wallet data from `GET /wallet`. Shows available balance, total earned, subscriber/follower counts from user object, quick-action grid, recent transactions. "Withdraw" button routes to `/creator-payout`.

### `app/settings.tsx`
Privacy → navigates to `/privacy-settings`. Notifications → navigates to `/notification-settings`. Security → navigates to `/security-settings`. `handleLinkedAccounts` replaced with `handleLinkedAccountsAlert` (Alert.alert with instructions).

### `app/edit-profile.tsx`
Added Website, Location, Birthday, Gender fields. Extra fields stored in `@ms_profile_extra` AsyncStorage key (not in User type) until `PATCH /users/me` is live. Save handles 405 gracefully (optimistic local update). `GENDER_OPTIONS` = ['Prefer not to say', 'Male', 'Female', 'Non-binary', 'Other'].

### `app/chat/[id].tsx`
Added `replyTo` state. Reply action in long-press sheet sets `replyTo` instead of prepending @mention text. Reply preview bar appears above the input bar showing sender name + message snippet. `X` button clears reply. Send clears `replyTo` on dispatch.

## BACKEND_REQUIRED.md
Documents 15 missing endpoints with full spec: user search, creator profile, follow/unfollow, conversations, PATCH /users/me, comment CRUD, change password, sign-out-all, creator withdrawal, analytics, plans, payment methods, linked accounts.

**Why:** All these endpoints are frontend-ready — the UI is wired and handles 404/405 gracefully.

## Patterns
- Extra profile fields not in User type → store in separate AsyncStorage keys
- Post type uses `author` (not `creator`) for the PostAuthor object
- `MsLockedContent` replaces any inline "blur + lock" implementations
