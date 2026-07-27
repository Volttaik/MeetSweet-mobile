---
name: Auth context user fetch
description: How to safely unwrap the /users/me response in AuthContext
---

# Auth context /users/me response shape

`GET /api/users/me` — after `apiFetch` unwraps the `{ok, data}` envelope — may return either:
- A flat user object: `{id, username, avatar_url, ...}`
- A nested object: `{user: {id, username, avatar_url, ...}}`

**Why:** The backend returns `{ok: true, data: {user: {...}}}`, so after `apiFetch` unwraps `data`, the result is `{user: {...}}`. Passing this directly to `normalizeUser` produces an empty user (all fields undefined).

**How to apply:** In `contexts/AuthContext.tsx`, `fetchCurrentUser` must call:
```ts
normalizeUser((raw as any)?.user ?? raw)
```
Not just `normalizeUser(raw)`. This handles both response shapes safely.
