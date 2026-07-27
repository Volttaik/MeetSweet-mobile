# Backend Fix: Deploy Missing `POST /api/media/upload` Endpoint

## Context

You are working on the **MeetSweet** backend — a Next.js 15 App Router API server deployed to production. The production server is missing a route that already exists and is fully implemented in the local/source version of the server. Your job is to port that exact implementation into the production server codebase and ensure it is deployed.

**Do not change any other routes, schemas, database tables, or configuration. Touch nothing outside the scope described below.**

---

## The Problem

The production server at `https://meetsweet-server.quizmi.space` returns **404** for:

```
POST /api/media/upload
```

The mobile app calls this endpoint as a fallback when it cannot upload directly to Cloudflare R2 from the browser (CORS restrictions on web targets). Without it, web clients cannot upload any media — images, videos, audio — so posts can only be created as text.

The local source server has this route fully implemented and working at:

```
app/api/media/upload/route.ts
```

The route exists in the codebase but has **not been deployed** to the production server.

---

## What the Route Does

1. Accepts a `multipart/form-data` `POST` request with a single `"file"` field.
2. Validates the file's MIME type and size against allowed types and per-category limits.
3. Uploads the file bytes **server-side** directly to Cloudflare R2 using an S3Client (no browser CORS involved).
4. Inserts a media record into the database via Drizzle ORM.
5. Returns a `201 Created` JSON response with the media record including `id`, `url`, `blob_path`, `type`, `mime_type`, `size_bytes`.

---

## Exact Source Code to Deploy

Below is the **complete, exact content** of the file that must exist at `app/api/media/upload/route.ts` in the production server codebase. Do not alter the logic — copy it exactly.

```typescript
import { NextRequest } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "@/middleware/auth";
import { ok, err } from "@/lib/api/response";
import { created } from "@/lib/api/response";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { generateId } from "@/lib/auth/codes";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm",
  "application/pdf", "text/plain", "application/rtf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
  "audio/mp4": "m4a", "audio/webm": "webm",
  "application/pdf": "pdf", "text/plain": "txt",
};

const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

function getCategory(mime: string) {
  if (mime.startsWith("image/")) return "image" as const;
  if (mime.startsWith("video/")) return "video" as const;
  if (mime.startsWith("audio/")) return "audio" as const;
  return "document" as const;
}

function getClient(): S3Client {
  const accessKeyId = config.r2.accessKeyId();
  const secretAccessKey = config.r2.secretAccessKey();
  if (!accessKeyId || !secretAccessKey || !config.r2.bucket()) {
    throw new Error("Cloudflare R2 credentials are not configured");
  }
  const endpoint =
    config.r2.endpoint() ??
    (() => {
      const accountId = config.r2.accountId();
      if (!accountId) throw new Error("R2_ENDPOINT or CLOUDFLARE_ACCOUNT_ID must be set");
      return `https://${accountId}.r2.cloudflarestorage.com`;
    })();
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/**
 * POST /api/media/upload
 *
 * Accepts a multipart/form-data body with a single "file" field.
 * Uploads the file to R2 server-side (no browser CORS required) and
 * registers a media record. Returns the media record with id, url, etc.
 *
 * This is the preferred upload path for web clients where browser CORS
 * prevents direct PUT to R2. Native clients may still use the presigned
 * URL flow via /api/credentials/upload-url for progress reporting.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("response" in auth) return auth.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("Request must be multipart/form-data", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return err('Missing "file" field in form data', 400);
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return err(`Unsupported file type: ${mime}`, 422);
  }

  const category = getCategory(mime);
  const maxBytes = MAX_BYTES[category];
  if (file.size > maxBytes) {
    return err(`File too large. Max for ${category}: ${maxBytes / 1024 / 1024}MB`, 413);
  }

  const folder =
    category === "image" || category === "video" || category === "audio"
      ? "posts"
      : "documents";
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const key = `${folder}/${auth.user.userId}/${crypto.randomUUID()}.${ext}`;

  // Upload to R2 server-side — no browser CORS involved
  let client: S3Client;
  try {
    client = getClient();
  } catch (e) {
    return err("Storage not configured: " + (e instanceof Error ? e.message : String(e)), 503);
  }

  const bytes = await file.arrayBuffer();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket()!,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: mime,
        ContentLength: file.size,
      })
    );
  } catch (e) {
    console.error("[media/upload] R2 put failed:", e);
    return err("Storage upload failed: " + (e instanceof Error ? e.message : String(e)), 502);
  }

  // Build public URL
  const publicBaseUrl = config.r2.publicBaseUrl();
  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/+$/, "")}/${key}`
    : "";

  // Register media record
  const mediaId = generateId();
  const mediaType = category === "audio" ? "video" : category === "document" ? "image" : category;
  await db.insert(media).values({
    id: mediaId,
    uploader_id: auth.user.userId,
    post_id: null,
    url: publicUrl || key,
    blob_path: key,
    type: mediaType as "image" | "video",
    mime_type: mime,
    size_bytes: file.size,
    width: null,
    height: null,
    duration_seconds: null,
  });

  return created({
    media: {
      id: mediaId,
      url: publicUrl || key,
      blob_path: key,
      type: mediaType,
      mime_type: mime,
      size_bytes: file.size,
    },
  });
}
```

---

## Dependencies Already in the Codebase

Every import in the above file already exists — do not install anything new:

| Import | Already exists at |
|--------|-------------------|
| `@aws-sdk/client-s3` | Listed in `package.json` dependencies — used by `app/api/credentials/upload-url/route.ts` |
| `requireAuth` | `middleware/auth.ts` |
| `ok`, `err`, `created` | `lib/api/response.ts` |
| `config` | `lib/config.ts` — R2 section reads `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` / `CLOUDFLARE_ACCOUNT_ID`, `R2_PUBLIC_BASE_URL` |
| `db` | `lib/db/index.ts` |
| `media` (table schema) | `lib/db/schema.ts` |
| `generateId` | `lib/auth/codes.ts` |

---

## `lib/config.ts` — R2 env var names (for reference)

The `config.r2` object resolves these environment variables:

```
R2_ENDPOINT              → explicit endpoint URL (optional if CLOUDFLARE_ACCOUNT_ID is set)
CLOUDFLARE_ACCOUNT_ID    → used to construct endpoint: https://{id}.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID         → R2 API access key
R2_SECRET_ACCESS_KEY     → R2 API secret key
R2_BUCKET_NAME           → bucket name
R2_PUBLIC_BASE_URL       → public CDN base URL (optional; if absent, blob_path is stored as url)
```

These must be set in the **production environment** for the endpoint to function. The endpoint code will return `503 Storage not configured` if any of the required vars are missing — it will not crash the server.

---

## Existing Related Route for Cross-Reference

There is already a working route at `app/api/media/route.ts` (POST handler) that registers a media record after a client-side R2 upload. The new upload route follows the same pattern but handles the file bytes server-side. Do not modify `app/api/media/route.ts`.

There is also `app/api/credentials/upload-url/route.ts` which issues presigned PUT URLs for native clients. Do not modify that either.

---

## Verification Steps

After deploying, verify the fix with:

```bash
# 1. Get a valid access token
TOKEN=$(curl -s -X POST https://meetsweet-server.quizmi.space/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<test_email>","password":"<test_password>"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data?.access_token))")

# 2. Upload a test image
curl -s -X POST https://meetsweet-server.quizmi.space/api/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/any/test.jpg;type=image/jpeg"
```

**Expected response (success):**
```json
{
  "ok": true,
  "data": {
    "media": {
      "id": "<generated_id>",
      "url": "<url_or_object_key>",
      "blob_path": "posts/<user_id>/<uuid>.jpg",
      "type": "image",
      "mime_type": "image/jpeg",
      "size_bytes": <number>
    }
  }
}
```

Previously this returned `404`. After the fix it should return `201`.

---

## Scope Boundary — Do Not Touch

- Any other route file
- Database schema (`lib/db/schema.ts`)
- Authentication middleware
- The `app/api/media/route.ts` registration-only POST handler
- The `app/api/credentials/upload-url/route.ts` presigned URL handler
- Any frontend / mobile code
- Environment variable values (only ensure they are set in the deployment platform's env config)
