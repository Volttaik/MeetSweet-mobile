---
name: Service normalizers
description: Pattern used in all service files to map backend snake_case to frontend camelCase, and the canonical User type fields.
---

# Service normalizers

**Why:** Backend returns snake_case fields; the React Native UI uses camelCase. A per-service normalizer function converts on ingress.

## Pattern
Each service file has a `normalizeX()` function that accepts `any` raw API response and returns the strongly-typed frontend interface. Example:
```ts
function normalizeUser(raw: any): User { return { id: raw.id, name: raw.full_name ?? raw.name, ... } }
```

## User type (canonical)
Fields that exist: `id, name, username, email, phone, bio, avatarUrl, bannerUrl, website, location, isVerified, isCreator, isVerifiedCreator, role, followerCount, followingCount, postCount, createdAt`

Fields that do NOT exist (removed): `credits`, `subscriberCount` — these were in the old type but the backend doesn't send them.

## backend→frontend field map (key cases)
- `full_name` → `name`
- `avatar_url` → `avatarUrl`
- `banner_url` → `bannerUrl`
- `is_verified` → `isVerified`
- `is_creator` → `isCreator`
- `is_verified_creator` → `isVerifiedCreator`
- `follower_count` → `followerCount`
- `following_count` → `followingCount`
- `post_count` → `postCount`
- `created_at` → `createdAt`

**How to apply:** When adding new service functions, always pass the response through a normalizer before returning to UI layer.
