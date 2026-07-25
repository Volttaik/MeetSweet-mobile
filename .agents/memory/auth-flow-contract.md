---
name: Auth flow contract
description: Exact field names and response shapes for all auth endpoints on the MeetSweet backend.
---

# Auth flow contract

**Why:** The frontend was sending wrong field names (identifier, accessToken, refreshToken) that don't match the backend, causing silent 400 errors on login/register/refresh.

## Login
- `POST /api/auth/login` body: `{ email, password }` (NOT `identifier`)
- Response: `{ ok, data: { access_token, refresh_token, user } }`

## Register
- `POST /api/auth/register` body: `{ full_name, username, email, password, phone? }`
- Response: `{ ok, data: { user_id } }` — does NOT return tokens; sends verification email
- Flow: register → redirect to `/verify-email?email=...` → user clicks link → normal login

## Refresh
- `POST /api/auth/refresh` body: `{ refresh_token }` (NOT `refreshToken`)
- Response: `{ ok, data: { access_token, refresh_token } }`

## Get current user
- `GET /api/users/me` (NOT `/api/auth/me`)
- Returns user object, normalized via `normalizeUser()` in AuthContext

## Token storage keys
- `@ms_access_token` — access token
- `@ms_refresh_token` — refresh token
- `@ms_user` — JSON-serialized User object

**How to apply:** Any screen touching auth must use these exact field names and storage keys. AuthContext owns the normalizer; screens just call `useAuth()`.
