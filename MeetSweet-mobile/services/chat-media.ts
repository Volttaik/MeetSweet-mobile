/**
 * chat-media.ts — on-device cache for private-message media, backed by the
 * current Expo File System API (SDK 55: File / Directory / Paths).
 *
 * Principles:
 *   • The server stores the canonical media and its remote URL. This module
 *     only mirrors already-downloaded bytes locally for fast re-rendering.
 *   • Stable filenames derived from the attachment id — the same media always
 *     maps to the same file, so it is never downloaded twice and duplicate
 *     files are never created.
 *   • Every entry carries metadata (lib/chat-cache.ts): messageId, mediaType,
 *     remoteUrl, localUri, downloaded, downloadStatus. The bytes live HERE in
 *     the File System; the database only stores the metadata.
 *   • If a local file is missing/corrupted, the cache resolves to null and the
 *     UI falls back to the canonical remote URL and offers Download again —
 *     a broken cache entry never produces a permanently broken media bubble.
 *   • LRU pruning bounds the disk footprint (no unlimited caching forever).
 *
 * Web: no local File System — every function degrades to null/no-op so remote
 * URLs are used directly.
 */

import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import {
  deleteChatMediaMeta,
  getChatMediaMeta,
  setChatMediaMeta,
  type ChatMediaMeta,
} from '@/lib/chat-cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_FOLDER_NAME = 'meetsweet_chat_media';
const MAX_CACHE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB max disk footprint
const PRUNE_TARGET_SIZE_BYTES = 140 * 1024 * 1024; // prune down to 140 MB
/** Treat files smaller than this as corrupt/partial and re-download. */
const MIN_VALID_FILE_BYTES = 1024;

const _inFlightDownloads = new Map<string, Promise<string | null>>();

function sanitizeId(id: string): string {
  return (id || 'media').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/** Pick a file extension from the media type + remote URL (fallback safe). */
function mediaExtension(mediaType: string, remoteUrl?: string | null): string {
  if (remoteUrl) {
    try {
      const clean = remoteUrl.split('?')[0].split('#')[0];
      const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
      if (match) {
        const ext = match[1].toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'mkv', 'pdf'].includes(ext)) {
          return ext;
        }
      }
    } catch {
      // fall through
    }
  }
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

/** Stable cache file name for an attachment — never changes for the same media. */
function mediaFileName(attachmentId: string, mediaType: string, remoteUrl?: string | null): string {
  return `pm_${sanitizeId(attachmentId)}.${mediaExtension(mediaType, remoteUrl)}`;
}

function cacheRoot(): Directory | null {
  if (Platform.OS === 'web') return null;
  try {
    return new Directory(Paths.cache, CACHE_FOLDER_NAME);
  } catch {
    return null;
  }
}

function ensureCacheDir(): Directory | null {
  const dir = cacheRoot();
  if (!dir) return null;
  try {
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
    return dir;
  } catch {
    return null;
  }
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Resolve an attachment's locally-cached file. Returns the local URI when the
 * file actually exists and is non-trivial; otherwise returns null AND clears
 * the stale metadata so the caller knows to offer Download again.
 */
export async function getCachedChatMedia(
  attachmentId: string,
  mediaType: 'image' | 'video' | 'file',
  remoteUrl?: string | null,
  userId?: string,
): Promise<string | null> {
  if (Platform.OS === 'web' || !attachmentId) return null;
  const dir = cacheRoot();
  if (!dir?.exists) return null;

  const fileName = mediaFileName(attachmentId, mediaType, remoteUrl);
  let file: File;
  try {
    file = new File(dir, fileName);
  } catch {
    return null;
  }

  if (file.exists && file.size >= MIN_VALID_FILE_BYTES) {
    // Metadata may be stale (e.g. cache was cleared) — refresh it so the
    // message DB knows the file is present.
    const meta = await getChatMediaMeta(attachmentId);
    if (meta && (!meta.localUri || meta.localUri !== file.uri)) {
      await setChatMediaMeta({ ...meta, localUri: file.uri, downloaded: true, status: 'downloaded' });
    }
    return file.uri;
  }

  // File missing or corrupt — drop the stale metadata entry so the UI shows
  // the Download action again instead of a broken bubble.
  if (file.exists) {
    try {
      file.delete();
    } catch {
      // best-effort
    }
  }
  await deleteChatMediaMeta(attachmentId);
  return null;
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download an attachment's remote media into the local cache and record
 * metadata. In-flight downloads for the same attachment are deduplicated.
 * Returns the local URI, or null on failure (caller keeps the remote URL).
 */
export async function downloadChatMedia(input: {
  attachmentId: string;
  userId: string;
  messageId?: string | null;
  mediaType: 'image' | 'video' | 'file';
  remoteUrl: string;
}): Promise<string | null> {
  const { attachmentId, userId, messageId, mediaType, remoteUrl } = input;
  if (Platform.OS === 'web' || !attachmentId || !remoteUrl) return null;
  if (remoteUrl.startsWith('file://')) return remoteUrl;

  const existing = _inFlightDownloads.get(attachmentId);
  if (existing) return existing;

  const downloadPromise = (async (): Promise<string | null> => {
    const dir = ensureCacheDir();
    if (!dir) return null;

    const fileName = mediaFileName(attachmentId, mediaType, remoteUrl);
    const dest = new File(dir, fileName);

    try {
      await setChatMediaMeta({
        attachmentId,
        userId,
        messageId: messageId ?? null,
        mediaType,
        remoteUrl,
        localUri: null,
        downloaded: false,
        status: 'downloading',
        cachedAt: Date.now(),
      });

      await File.downloadFileAsync(remoteUrl, dest, { idempotent: true });

      // Guard against a partial/corrupt file landing in the final path.
      if (!dest.exists || dest.size < MIN_VALID_FILE_BYTES) {
        if (dest.exists) {
          try {
            dest.delete();
          } catch {
            // best-effort
          }
        }
        await setChatMediaMeta({
          attachmentId,
          userId,
          messageId: messageId ?? null,
          mediaType,
          remoteUrl,
          localUri: null,
          downloaded: false,
          status: 'error',
          cachedAt: Date.now(),
        });
        return null;
      }

      await setChatMediaMeta({
        attachmentId,
        userId,
        messageId: messageId ?? null,
        mediaType,
        remoteUrl,
        localUri: dest.uri,
        downloaded: true,
        status: 'downloaded',
        cachedAt: Date.now(),
      });

      // Background LRU pruning — bounded disk footprint.
      pruneChatMediaCache().catch(() => {});

      return dest.uri;
    } catch (e) {
      // Android can leave a partial file behind on failure — remove it so the
      // next attempt starts clean.
      try {
        if (dest.exists) dest.delete();
      } catch {
        // best-effort
      }
      await setChatMediaMeta({
        attachmentId,
        userId,
        messageId: messageId ?? null,
        mediaType,
        remoteUrl,
        localUri: null,
        downloaded: false,
        status: 'error',
        cachedAt: Date.now(),
      }).catch(() => {});
      console.warn('[chat-media] download failed:', attachmentId, e);
      return null;
    } finally {
      _inFlightDownloads.delete(attachmentId);
    }
  })();

  _inFlightDownloads.set(attachmentId, downloadPromise);
  return downloadPromise;
}

// ─── Register sender-local media ──────────────────────────────────────────────

/**
 * Register media the USER picked from their own device (sending flow) so the
 * sender renders from the original local file instead of downloading their own
 * upload back from the server. The picked file is copied into the cache under
 * the attachment's stable name. Web has no file system — metadata only.
 */
export async function registerLocalChatMedia(input: {
  attachmentId: string;
  userId: string;
  messageId?: string | null;
  mediaType: 'image' | 'video' | 'file';
  localUri: string;
  remoteUrl?: string | null;
}): Promise<string | null> {
  const { attachmentId, userId, messageId, mediaType, localUri, remoteUrl } = input;
  if (!attachmentId || !localUri) return null;
  if (Platform.OS === 'web') {
    // Web cannot persist the picked file; record metadata referencing it so the
    // same session renders locally, and let the remote URL take over later.
    await setChatMediaMeta({
      attachmentId,
      userId,
      messageId: messageId ?? null,
      mediaType,
      remoteUrl: remoteUrl ?? null,
      localUri: null,
      downloaded: false,
      status: 'none',
      cachedAt: Date.now(),
    }).catch(() => {});
    return localUri;
  }

  const dir = ensureCacheDir();
  if (!dir) return null;

  const fileName = mediaFileName(attachmentId, mediaType, remoteUrl);
  const dest = new File(dir, fileName);

  try {
    // Same file already cached — nothing to do.
    if (dest.exists && dest.size >= MIN_VALID_FILE_BYTES) {
      await setChatMediaMeta({
        attachmentId,
        userId,
        messageId: messageId ?? null,
        mediaType,
        remoteUrl: remoteUrl ?? null,
        localUri: dest.uri,
        downloaded: true,
        status: 'downloaded',
        cachedAt: Date.now(),
      });
      return dest.uri;
    }
    const src = new File(localUri);
    if (!src.exists || src.size === 0) return null;
    if (dest.exists) {
      try {
        dest.delete();
      } catch {
        // best-effort
      }
    }
    src.copy(dest);
    await setChatMediaMeta({
      attachmentId,
      userId,
      messageId: messageId ?? null,
      mediaType,
      remoteUrl: remoteUrl ?? null,
      localUri: dest.uri,
      downloaded: true,
      status: 'downloaded',
      cachedAt: Date.now(),
    });
    pruneChatMediaCache().catch(() => {});
    return dest.uri;
  } catch (e) {
    console.warn('[chat-media] register local media failed:', attachmentId, e);
    return null;
  }
}

// ─── Pruning ──────────────────────────────────────────────────────────────────

/** Delete oldest cached media until the directory is back under the target. */
export async function pruneChatMediaCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = cacheRoot();
  if (!dir?.exists) return;

  try {
    const entries = dir.list();
    if (entries.length === 0) return;

    const files = entries
      .filter((e): e is File => e instanceof File)
      .map((f) => ({ file: f, size: f.size ?? 0, mtime: f.modificationTime ?? 0 }))
      .filter((f) => f.size > 0);

    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= MAX_CACHE_SIZE_BYTES) return;

    files.sort((a, b) => a.mtime - b.mtime); // oldest first

    let current = total;
    for (const { file } of files) {
      if (current <= PRUNE_TARGET_SIZE_BYTES) break;
      try {
        const attachmentId = attachmentIdFromFileName(file.name);
        file.delete();
        current -= file.size ?? 0;
        if (attachmentId) await deleteChatMediaMeta(attachmentId);
      } catch {
        // best-effort — a file that refuses to delete doesn't block pruning
      }
    }
  } catch (e) {
    console.warn('[chat-media] prune failed:', e);
  }
}

/** Reverse of mediaFileName — pull the attachment id back out of a cache file. */
function attachmentIdFromFileName(name: string): string | null {
  const match = name.match(/^pm_([a-zA-Z0-9_-]+)\.[a-zA-Z0-9]{2,5}$/);
  return match ? match[1] : null;
}

// ─── Full clear ───────────────────────────────────────────────────────────────

/** Remove every cached chat media file (used on logout / storage pressure). */
export async function clearChatMediaCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = cacheRoot();
  if (!dir?.exists) return;
  try {
    dir.delete();
  } catch (e) {
    console.warn('[chat-media] clear failed:', e);
  }
}

/** Total cached chat media size in bytes (cache-management visibility). */
export async function getChatMediaCacheSize(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const dir = cacheRoot();
  if (!dir?.exists) return 0;
  try {
    return dir.size ?? 0;
  } catch {
    return 0;
  }
}
