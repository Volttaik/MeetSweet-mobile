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
