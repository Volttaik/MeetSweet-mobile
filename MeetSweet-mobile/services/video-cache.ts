/**
 * Video Disk Cache Service — Local LRU caching for instant playback and 0ms rewind.
 *
 * Problem:
 * When streaming remote video URLs (https://...), native players (AVPlayer / ExoPlayer)
 * dump past chunks from memory to preserve RAM. Seeking backward (rewinding 10s)
 * forces a new HTTP Range request, causing annoying re-buffering spinners.
 *
 * Solution:
 * This service caches video files to the local disk cache directory (FileSystem.cacheDirectory).
 * When playing from a local file:// URI, rewinding and seeking are 100% instant (0ms latency).
 *
 * Features:
 * - Transparent fallback on Web and non-supported environments.
 * - In-flight download deduplication (never duplicate downloads for the same video).
 * - Automatic LRU (Least Recently Used) cache pruning when total cache exceeds limit (250 MB).
 * - Background preloading for Shorts and Feed videos.
 * - Corruption detection (ignores and cleans up 0-byte or failed downloads).
 */


type FileSystemModule = typeof import('expo-file-system/legacy');
let _fs: FileSystemModule | null | undefined;

async function getFs(): Promise<FileSystemModule | null> {
  if (_fs === undefined) {
    try {
      _fs = await import('expo-file-system/legacy');
    } catch (e) {
      console.warn('[video-cache] expo-file-system/legacy unavailable:', e);
      _fs = null;
    }
  }
  return _fs;
}

const CACHE_FOLDER_NAME = 'meetsweet_video_cache';
const MAX_CACHE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB max disk footprint
const PRUNE_TARGET_SIZE_BYTES = 180 * 1024 * 1024; // Prune down to 180 MB when limit hit

// In-flight download map to prevent duplicate network downloads
const _inFlightDownloads = new Map<string, Promise<string | null>>();

// In-memory set of confirmed cached local URIs for fast synchronous-like checks
const _cachedFileUris = new Set<string>();

/**
 * Sanitize video IDs and URLs into safe file names.
 */
function sanitizeFileName(id: string, ext = 'mp4'): string {
  const safeId = (id || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return `${safeId}.${ext}`;
}

/**
 * Extract extension from URL.
 */
function getExtension(url: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match && ['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase();
    }
  } catch {
    // fallback
  }
  return 'mp4';
}

/**
 * True for directly-downloadable progressive files. Adaptive streams (HLS
 * .m3u8 manifests, etc.) must stream from the network — "caching" the manifest
 * as a file would break playback since its segments live remotely.
 */
function isCacheableVideo(url: string): boolean {
  const clean = url.split('?')[0].split('#')[0];
  return /\.(mp4|mov|m4v|webm|mkv)$/i.test(clean);
}

/**
 * Ensure the video cache root directory exists.
 */
async function getCacheDir(fs: FileSystemModule): Promise<string | null> {
  if (!fs.cacheDirectory) return null;
  const dir = `${fs.cacheDirectory.replace(/\/+$/, '')}/${CACHE_FOLDER_NAME}/`;
  try {
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) {
      await fs.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch (err) {
    console.warn('[video-cache] Failed to create cache directory:', err);
    return null;
  }
}

/**
 * Prune old cache files when total directory size exceeds MAX_CACHE_SIZE_BYTES.
 */
async function pruneCacheIfNeeded(fs: FileSystemModule, cacheDir: string): Promise<void> {
  try {
    const files = await fs.readDirectoryAsync(cacheDir);
    if (!files || files.length === 0) return;

    let totalSize = 0;
    const fileStats: Array<{ path: string; size: number; modificationTime: number }> = [];

    for (const fileName of files) {
      const filePath = `${cacheDir}${fileName}`;
      const info = await fs.getInfoAsync(filePath);
      if (info.exists && typeof info.size === 'number') {
        totalSize += info.size;
        fileStats.push({
          path: filePath,
          size: info.size,
          modificationTime: info.modificationTime ?? 0,
        });
      }
    }

    if (totalSize <= MAX_CACHE_SIZE_BYTES) {
      return;
    }

    // Sort by modification time ascending (oldest first)
    fileStats.sort((a, b) => a.modificationTime - b.modificationTime);

    let currentSize = totalSize;
    for (const file of fileStats) {
      if (currentSize <= PRUNE_TARGET_SIZE_BYTES) break;
      try {
        await fs.deleteAsync(file.path, { idempotent: true });
        _cachedFileUris.delete(file.path);
        currentSize -= file.size;
      } catch {
        // Ignore deletion errors
      }
    }
  } catch (err) {
    console.warn('[video-cache] Cache pruning failed:', err);
  }
}

/**
 * Check if a video is already cached on disk.
 * Returns local file URI if ready and valid, otherwise null.
 */
export async function getCachedVideoFile(
  remoteUrl: string | null | undefined,
  videoId?: string,
): Promise<string | null> {
  if (!remoteUrl) return null;
  if (remoteUrl.startsWith('file://')) return remoteUrl;
  // Adaptive streams (HLS) must play from the network, never from a local file.
  if (!isCacheableVideo(remoteUrl)) return null;

  const fs = await getFs();
  if (!fs) return null;

  const cacheDir = await getCacheDir(fs);
  if (!cacheDir) return null;

  const ext = getExtension(remoteUrl);
  const fileName = sanitizeFileName(videoId || remoteUrl, ext);
  const localPath = `${cacheDir}${fileName}`;

  try {
    const info = await fs.getInfoAsync(localPath);
    if (info.exists && typeof info.size === 'number' && info.size > 1024) {
      _cachedFileUris.add(localPath);
      return localPath;
    }
    // Clean up empty or corrupted file if found
    if (info.exists && info.size === 0) {
      await fs.deleteAsync(localPath, { idempotent: true });
    }
  } catch {
    // Info check failed
  }

  return null;
}

/**
 * Download and cache a video to local storage in background.
 * Returns local file URI when done.
 */
export async function downloadAndCacheVideo(
  remoteUrl: string,
  videoId?: string,
): Promise<string | null> {
  if (!remoteUrl || remoteUrl.startsWith('file://')) {
    return null;
  }
  if (!isCacheableVideo(remoteUrl)) return null;

  // Deduplicate in-flight downloads for the same URL
  const existing = _inFlightDownloads.get(remoteUrl);
  if (existing) {
    return existing;
  }

  const downloadPromise = (async (): Promise<string | null> => {
    try {
      const fs = await getFs();
      if (!fs) return null;

      const cacheDir = await getCacheDir(fs);
      if (!cacheDir) return null;

      const ext = getExtension(remoteUrl);
      const fileName = sanitizeFileName(videoId || remoteUrl, ext);
      const localPath = `${cacheDir}${fileName}`;

      // Check if already downloaded
      const info = await fs.getInfoAsync(localPath);
      if (info.exists && typeof info.size === 'number' && info.size > 1024) {
        _cachedFileUris.add(localPath);
        return localPath;
      }

      // Perform download
      const tempPath = `${localPath}.tmp_${Date.now()}`;
      const result = await fs.downloadAsync(remoteUrl, tempPath);

      if (result.status === 200) {
        // Move temporary file to final path
        await fs.moveAsync({ from: tempPath, to: localPath });
        _cachedFileUris.add(localPath);

        // Run background LRU pruning if needed
        pruneCacheIfNeeded(fs, cacheDir).catch(() => {});

        return localPath;
      } else {
        // Delete temp failed download
        await fs.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        return null;
      }
    } catch (err) {
      console.warn('[video-cache] Failed to cache video:', remoteUrl, err);
      return null;
    } finally {
      _inFlightDownloads.delete(remoteUrl);
    }
  })();

  _inFlightDownloads.set(remoteUrl, downloadPromise);
  return downloadPromise;
}

/**
 * Preload a video into local disk cache in the background.
 * Used for prebuffering upcoming Shorts and Feed videos.
 */
export function preloadVideo(remoteUrl: string | null | undefined, videoId?: string): void {
  if (!remoteUrl || remoteUrl.startsWith('file://')) return;
  if (!isCacheableVideo(remoteUrl)) return;
  downloadAndCacheVideo(remoteUrl, videoId).catch(() => {});
}

/**
 * Get total cache size in bytes.
 */
export async function getVideoCacheSize(): Promise<number> {
  const fs = await getFs();
  if (!fs) return 0;
  const cacheDir = await getCacheDir(fs);
  if (!cacheDir) return 0;

  try {
    const files = await fs.readDirectoryAsync(cacheDir);
    let totalSize = 0;
    for (const fileName of files) {
      const info = await fs.getInfoAsync(`${cacheDir}${fileName}`);
      if (info.exists && typeof info.size === 'number') {
        totalSize += info.size;
      }
    }
    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Clear the entire video cache directory.
 */
export async function clearVideoCache(): Promise<void> {
  const fs = await getFs();
  if (!fs) return;
  const cacheDir = await getCacheDir(fs);
  if (!cacheDir) return;

  try {
    await fs.deleteAsync(cacheDir, { idempotent: true });
    _cachedFileUris.clear();
  } catch (err) {
    console.warn('[video-cache] Clear cache error:', err);
  }
}
