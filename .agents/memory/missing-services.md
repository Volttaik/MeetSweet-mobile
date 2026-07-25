---
name: Missing services added
description: New service files created to cover creator dashboard, subscriptions, settings, and search endpoints.
---

# Missing service files

**Why:** Several screens referenced services that didn't exist, causing import errors. All have been created.

## Files created
- `services/creator.ts` — `getCreatorDashboard`, `getCreatorAnalytics`, `getCreatorRevenue`, `getCreatorSubscribers`, `becomeCreator`, `requestWithdrawal`; endpoints: `/creator/*`
- `services/subscriptions.ts` — `getSubscriptions`, `subscribe`, `cancelSubscription`; endpoints: `/subscriptions/*`
- `services/settings.ts` — `getSettings`, `updateSettings`, `updatePassword`, `toggleBiometric`, `deleteAccount`, `logoutAllDevices`; endpoints: `/settings`, `/auth/*`
- `services/search.ts` — `search`, `getRecentSearches`, `clearSearchHistory`, `getExplore`; endpoints: `/search/*`, `/explore`
- `services/categories.ts` — `getCategories`; endpoint: `/categories`

**How to apply:** Import from these files for any creator/subscription/settings/search feature. Do not call the raw `/creator/*` endpoints from screens.
