---
name: Scoped credentials architecture
description: The new broker backend issues short-lived credentials; app uploads directly to R2 via presigned PUT URLs; no feature APIs on broker.
---

# Scoped Credentials Architecture

## The rule
The credential broker backend (EXPO_PUBLIC_BROKER_URL or EXPO_PUBLIC_API_URL) handles ONLY:
- Auth: /api/auth/*
- Credentials: /api/credentials/upload-url, download-url, token, revoke, config, database
- Health: /api/healthz, /api/diagnostic

Feature data (posts, users, comments, notifications) still hits the legacy feature API at meetsweet-server.quizmi.space.

## Upload flow (NEW)
1. Call `requestUploadUrl(mimeType, folder)` from `services/credentials/index.ts`
2. PUT file blob directly to R2 using the returned `upload_url`
3. Store `object_key` in the database (NOT the presigned URL)
4. Call `requestDownloadUrl(objectKey)` to get a viewable URL when needed

## Key files
- `services/credentials/index.ts` — broker client (requestUploadUrl, requestDownloadUrl, runDatabaseQuery, requestScopedToken)
- `services/storage/upload.ts` — full upload service with MIME normalisation, retry, progress, cancellation
- `services/storage/download.ts` — resolveObjectUrl() helper
- `services/media.ts` — thin shim over upload.ts for backward compat

## MIME normalisation
All platform MIME variants (image/heic, video/mov, etc.) are normalised to canonical types before upload. See `normaliseMime()` in `services/storage/upload.ts`. Never hardcode MIME types without normalising.

**Why:** The old media.ts proxied through /api/media/upload which caused "Unsupported File Type" errors for platform-variant MIME types and had no retry or cancellation. The new flow fixes all of this.

**How to apply:** Always use `uploadPostMedia()`, `uploadAvatar()`, or `uploadDocument()` from `services/storage/upload.ts` for new upload code. Never POST to /api/media/upload.
