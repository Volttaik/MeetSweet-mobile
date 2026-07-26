/**
 * Media upload service — delegates to the presigned R2 upload pipeline.
 *
 * This module is a thin compatibility shim retained for screens that import
 * uploadMedia(). New code should import directly from services/storage/upload.
 */

export { normaliseMime, isAcceptedMime } from '@/services/storage/upload';
import { uploadFile, normaliseMime } from '@/services/storage/upload';
import { requestDownloadUrl } from '@/services/credentials';

export interface UploadedMedia {
  /** R2 object key — store this in the DB, not a URL */
  id: string;
  /** Presigned download URL (short-lived). Resolve on demand via resolveObjectUrl(). */
  url: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  thumbnailUrl: string | null;
}

/**
 * Upload a media file.  Returns a short-lived signed URL alongside the stable
 * object key (stored as `id`).
 *
 * @param uri        - Local file URI from expo-image-picker / expo-document-picker
 * @param mimeType   - Raw MIME type from the OS (auto-normalised)
 * @param _filename  - Ignored; extension is inferred from MIME
 * @param onProgress - Optional progress callback (0–1)
 */
export async function uploadMedia(
  uri: string,
  mimeType: string,
  _filename?: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const mime = normaliseMime(mimeType);
  const result = await uploadFile(uri, mime, { onProgress });

  // Resolve a short-lived download URL so callers can immediately display the file
  let url = '';
  try {
    const dl = await requestDownloadUrl(result.objectKey);
    url = dl.url;
  } catch {
    // URL resolution is best-effort; the objectKey is what matters for storage
    url = '';
  }

  const type =
    result.category === 'image' ? 'image'
    : result.category === 'video' ? 'video'
    : result.category === 'audio' ? 'audio'
    : result.category === 'document' ? 'document'
    : 'other';

  return {
    id: result.objectKey,
    url,
    type,
    thumbnailUrl: null,
  };
}
