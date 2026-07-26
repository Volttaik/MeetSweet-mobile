/**
 * Download / URL resolution helpers.
 *
 * Object keys returned by the upload service should be stored in the database.
 * When you need to display an image or video, call resolveObjectUrl() to
 * obtain a short-lived signed URL from the credential broker.
 *
 * If the R2 bucket has a public base URL configured, that is used directly
 * (no broker round-trip required). Otherwise a presigned GET URL is requested.
 */

import { requestDownloadUrl } from '@/services/credentials';

let _publicBase: string | null | undefined = undefined; // undefined = not loaded yet

/** Inject the public R2 base URL at startup (from getBrokerConfig). */
export function setPublicBase(url: string | null) {
  _publicBase = url;
}

/**
 * Resolve an R2 object key to a viewable URL.
 * - If the object key already looks like a full https:// URL, return it as-is.
 * - If a public CDN base is available, construct the public URL.
 * - Otherwise, request a presigned GET URL from the broker (short network call).
 */
export async function resolveObjectUrl(keyOrUrl: string | null | undefined): Promise<string | null> {
  if (!keyOrUrl) return null;
  // Already a full URL
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) return keyOrUrl;

  // Public CDN base (no auth required)
  if (_publicBase) {
    return `${_publicBase.replace(/\/+$/, '')}/${keyOrUrl}`;
  }

  // Fall back to broker-signed URL
  try {
    const { url } = await requestDownloadUrl(keyOrUrl);
    return url;
  } catch {
    return null;
  }
}

/**
 * Batch resolve multiple keys to URLs.
 */
export async function resolveObjectUrls(
  keys: (string | null | undefined)[],
): Promise<(string | null)[]> {
  return Promise.all(keys.map(resolveObjectUrl));
}
