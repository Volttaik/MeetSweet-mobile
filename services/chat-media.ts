/**
 * Chat Room local media storage — Expo FileSystem.
 *
 * Every media message in a Chat Room is persisted as a local file on the
 * device, structured so media cannot collide between rooms:
 *
 *   <documentDirectory>/chat-media/<chatRoomId>/<messageId>.<ext>
 *
 * The remote `mediaUrl` always remains available as a fallback. Rendering
 * callers should prefer `localUri` when present, otherwise `mediaUrl`.
 *
 * Web is unsupported (no native FileSystem) — all functions there return null
 * and callers naturally fall back to the remote URL.
 */

import { Platform } from 'react-native';

// expo-file-system is native-only. On web the import would fail at runtime, so
// we lazy-load it inside each function and bail out on web.
type FileSystemModule = typeof import('expo-file-system/legacy');

let _fs: FileSystemModule | null | undefined;

async function fs(): Promise<FileSystemModule | null> {
  if (Platform.OS === 'web') return null;
  if (_fs === undefined) {
    try {
      _fs = await import('expo-file-system/legacy');
    } catch (e) {
      console.warn('[chat-media] expo-file-system unavailable:', e);
      _fs = null;
    }
  }
  return _fs;
}

const MEDIA_DIR_NAME = 'chat-media';

/** Root directory holding per-room media subdirectories. */
function mediaRoot(documentDirectory: string): string {
  const root = documentDirectory.replace(/\/+$/, '');
  return root.endsWith(MEDIA_DIR_NAME) ? root : `${root}/${MEDIA_DIR_NAME}`;
}

/** Per-room directory: <root>/<chatRoomId>/ */
function roomDir(documentDirectory: string, chatRoomId: string): string {
  return `${mediaRoot(documentDirectory)}${sanitize(chatRoomId)}`;
}

/** Final file path: <root>/<chatRoomId>/<messageId>.<ext> */
function filePath(documentDirectory: string, chatRoomId: string, messageId: string, ext: string): string {
  return `${roomDir(documentDirectory, chatRoomId)}/${sanitize(messageId)}.${ext}`;
}

/** Replace path separators so a malicious id can't escape the room dir. */
function sanitize(id: string): string {
  return (id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Pick an extension from a MIME type or a URL. Falls back to `bin`.
 */
export function extForMedia(
  mime: string | undefined | null,
  url: string | undefined | null,
  mediaType: 'image' | 'video' | 'audio' | 'document' | null | undefined,
): string {
  const byMime = mime ? mimeToExt(mime) : null;
  if (byMime) return byMime;
  if (url) {
    const clean = url.split('?')[0].split('#')[0];
    const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return m[1].toLowerCase();
  }
  switch (mediaType) {
    case 'image': return 'jpg';
    case 'video': return 'mp4';
    case 'audio': return 'm4a';
    case 'document': return 'bin';
    default: return 'bin';
  }
}

function mimeToExt(mime: string): string | null {
  const m = mime.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/3gpp': '3gp',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  };
  return map[m] ?? null;
}

async function ensureDir(path: string): Promise<void> {
  const mod = await fs();
  if (!mod) return;
  try {
    const info = await mod.getInfoAsync(path);
    if (!info.exists) {
      await mod.makeDirectoryAsync(path, { intermediates: true });
    }
  } catch (e) {
    console.warn('[chat-media] ensureDir failed:', e);
  }
}

/**
 * Persist the local file for an OUTBOUND message (sent from this device).
 * Copies the picker/recorder's temporary `sourceUri` into the room's media
 * directory under <messageId>.<ext>, so the local copy is retained after the
 * temp URI is invalidated.
 *
 * Returns the persistent local file URI, or null on web / failure.
 */
export async function persistLocalMedia(
  chatRoomId: string,
  messageId: string,
  sourceUri: string,
  opts: { mime?: string | null; mediaType?: 'image' | 'video' | 'audio' | 'document' | null },
): Promise<string | null> {
  const mod = await fs();
  if (!mod || !chatRoomId || !messageId || !sourceUri) return null;
  const docDir = mod.documentDirectory;
  if (!docDir) return null;

  const ext = extForMedia(opts.mime, sourceUri, opts.mediaType);
  const dest = filePath(docDir, chatRoomId, messageId, ext);

  try {
    await ensureDir(roomDir(docDir, chatRoomId));
    const info = await mod.getInfoAsync(dest);
    if (info.exists) {
      // Already stored — keep the existing file.
      return dest;
    }
    await mod.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch (e) {
    console.warn('[chat-media] persistLocalMedia failed:', e);
    return null;
  }
}

/**
 * Download the remote media for an INBOUND (or freshly fetched) message into
 * the room's media directory under <messageId>.<ext>.
 *
 * Skips the download if the file already exists locally. Returns the local
 * file URI, or null on web / failure (caller falls back to mediaUrl).
 */
export async function downloadRoomMedia(
  chatRoomId: string,
  messageId: string,
  remoteUrl: string,
  opts: { mime?: string | null; mediaType?: 'image' | 'video' | 'audio' | 'document' | null },
): Promise<string | null> {
  const mod = await fs();
  if (!mod || !chatRoomId || !messageId || !remoteUrl) return null;
  const docDir = mod.documentDirectory;
  if (!docDir) return null;

  const ext = extForMedia(opts.mime, remoteUrl, opts.mediaType);
  const dest = filePath(docDir, chatRoomId, messageId, ext);

  try {
    await ensureDir(roomDir(docDir, chatRoomId));
    const info = await mod.getInfoAsync(dest);
    if (info.exists) return dest;

    const res = await mod.downloadAsync(remoteUrl, dest);
    return res?.uri ?? dest;
  } catch (e) {
    console.warn('[chat-media] downloadRoomMedia failed:', e);
    return null;
  }
}

/**
 * Check whether a specific absolute local file URI still exists on disk.
 *
 * Used to detect the "the user manually cleared device storage" case: a cached
 * message may carry a `localUri` whose underlying file was deleted out-of-band
 * (OS storage cleanup, app cache wipe, ...). Before trusting the cached URI,
 * callers verify with this so the media can be re-downloaded instead of
 * rendering a broken local reference. No-op (returns false) on web.
 */
export async function localMediaExists(localUri: string): Promise<boolean> {
  const mod = await fs();
  if (!mod || !localUri) return false;
  try {
    const info = await mod.getInfoAsync(localUri);
    return !!info.exists;
  } catch {
    return false;
  }
}

/**
 * Resolve the local URI for a message if a file already exists on disk.
 * Used when loading cached messages so we don't re-download.
 */
export async function resolveLocalMedia(
  chatRoomId: string,
  messageId: string,
  opts: { mime?: string | null; mediaType?: 'image' | 'video' | 'audio' | 'document' | null; url?: string | null },
): Promise<string | null> {
  const mod = await fs();
  if (!mod || !chatRoomId || !messageId) return null;
  const docDir = mod.documentDirectory;
  if (!docDir) return null;


  // Probe the most likely extension(s). extForMedia gives the preferred one;
  // also try a couple of common alternatives in case the original mime/url
  // differed when the file was first saved.
  const candidates = new Set<string>();
  const preferred = extForMedia(opts.mime, opts.url, opts.mediaType);
  candidates.add(preferred);
  if (opts.mediaType === 'image') { candidates.add('jpg'); candidates.add('png'); }
  if (opts.mediaType === 'video') { candidates.add('mp4'); candidates.add('mov'); }
  if (opts.mediaType === 'audio') { candidates.add('m4a'); candidates.add('mp3'); }

  for (const ext of candidates) {
    const dest = filePath(docDir, chatRoomId, messageId, ext);
    try {
      const info = await mod.getInfoAsync(dest);
      if (info.exists) return dest;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Delete the local media file for a single message (any extension) inside a
 * room. Used on delete-for-me / delete-for-everyone so the local replica
 * doesn't keep orphaned files for messages the user no longer sees.
 *
 * Because the file extension isn't always known at delete time, this scans the
 * room directory and removes any file whose name starts with `<messageId>.`.
 * No-op on web / when the file is already gone.
 */
export async function deleteRoomMedia(
  chatRoomId: string,
  messageId: string,
): Promise<void> {
  const mod = await fs();
  if (!mod || !chatRoomId || !messageId) return;
  const docDir = mod.documentDirectory;
  if (!docDir) return;

  const dir = roomDir(docDir, chatRoomId);
  try {
    const info = await mod.getInfoAsync(dir);
    if (!info.exists) return;
    const target = sanitize(messageId);
    const entries = await mod.readDirectoryAsync(dir);
    for (const name of entries) {
      // sanitize() strips dots from the id, so `<messageId>.<ext>` is the
      // only file shape — a startsWith match is exact, never a prefix collision.
      if (name.startsWith(`${target}.`)) {
        await mod.deleteAsync(`${dir}/${name}`, { idempotent: true });
      }
    }
  } catch (e) {
    console.warn('[chat-media] deleteRoomMedia failed:', e);
  }
}

/**
 * Delete ALL local media files for a room (every message). Used on Clear Chat
 * and Delete Chat so the device doesn't accumulate orphaned files once the
 * user no longer has any messages in the room. No-op on web.
 */
export async function clearRoomMedia(chatRoomId: string): Promise<void> {
  const mod = await fs();
  if (!mod || !chatRoomId) return;
  const docDir = mod.documentDirectory;
  if (!docDir) return;

  const dir = roomDir(docDir, chatRoomId);
  try {
    const info = await mod.getInfoAsync(dir);
    if (!info.exists) return;
    // Remove the whole per-room directory and its contents.
    await mod.deleteAsync(dir, { idempotent: true });
  } catch (e) {
    console.warn('[chat-media] clearRoomMedia failed:', e);
  }
}
