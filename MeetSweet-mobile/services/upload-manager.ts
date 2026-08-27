/**
 * BackgroundUploadManager — keeps media uploads alive after the user leaves the
 * upload screen.
 *
 * MeetSweet uploads are direct-to-storage and can take a long time for large
 * videos. A plain component would lose its in-flight request the moment the
 * screen unmounts. This module-scoped singleton owns active uploads instead, so
 * an upload started on the create screen keeps running while the user navigates
 * anywhere else in the app. Progress is surfaced through device notifications
 * and through a tiny reactive store any mounted screen can subscribe to.
 *
 * REALITY OF NATIVE BACKGROUND EXECUTION:
 *   • In-app navigation (leaving the upload screen and moving around the app)
 *     keeps the JS runtime alive, so uploads continue here reliably.
 *   • Suspending the app to the background (home button) is subject to OS rules:
 *       – iOS suspends the JS runtime shortly after backgrounding, so a long
 *         in-flight fetch cannot be *guaranteed* to finish while suspended.
 *         When the app returns to the foreground the upload resumes from where
 *         it was (multipart parts already uploaded are kept via ETags).
 *       – Android may throttle background work depending on the device.
 *     We do NOT pretend a JS timer can guarantee OS-level background uploads.
 *     "Upload in background" here means "continue on your own while I use the
 *     app", which is the reliable, honest behaviour.
 *
 * State is persisted so screens can re-discover what's in flight (name, type,
 * status) after leaving and returning.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { isUnrecoverableUploadError } from '@/services/media';
import { mediaRecovery } from '@/lib/media-recovery';

export type UploadStatus = 'uploading' | 'complete' | 'failed';

export interface BackgroundUpload {
  uploadId: string;
  /** Stable label for notifications, e.g. "video" or "post". */
  label: string;
  fileName: string;
  fileUri: string;
  /** Local preview for the upload details screen (video thumbnail when
   *  available, otherwise the media URI itself). */
  previewUri?: string;
  mediaType: 'image' | 'video' | 'file';
  progress: number;
  status: UploadStatus;
  startedAt: string;
  error?: string;
  /**
   * False when retrying this exact job can never succeed (e.g. the local file
   * is gone, or the server rejected the format/size). The UI then offers
   * "select another video" instead of a Retry that would just fail again.
   * Defaults to true.
   */
  recoverable?: boolean;
}

type Listener = (uploads: BackgroundUpload[]) => void;

interface Job {
  upload: BackgroundUpload;
  run: (onProgress: (p: number) => void) => Promise<void>;
  /** Abort the in-flight transfer (user cancel). Best-effort: the run()
   *  promise rejects and the job is removed from the queue regardless. */
  abort?: () => void;
}

const STORAGE_KEY = '@ms_background_uploads';
const NOTIF_CHANNEL = 'uploads';

// A completed/failed upload stays visible (toast + details) for this long,
// then auto-dismisses. The timer only ever starts when the upload ENTERS a
// terminal state — an active upload is never dismissed by time.
const TERMINAL_DISMISS_MS = 10_000;

const active = new Map<string, Job>();
const listeners = new Set<Listener>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Notifications ──────────────────────────────────────────────────────────
// Local notifications are a NATIVE feature. On web there is no OS notification
// centre to schedule against (expo-notifications does not support local
// notifications in the browser), so we degrade gracefully to the in-app
// upload panel instead of erroring. All notification calls are also wrapped so
// a failure here can NEVER corrupt the true outcome of an upload job.

const isWeb = Platform.OS === 'web';

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: 'Uploads',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // Non-fatal.
  }
}

function notifId(uploadId: string): string {
  return `upload:${uploadId}`;
}

/**
 * Present a local upload notification, or on web fall back to the browser
 * Notifications API when the user has granted permission. Never throws.
 */
async function notify(content: {
  title: string;
  body: string;
  uploadId: string;
  done?: 'complete' | 'failed';
}): Promise<void> {
  try {
    if (isWeb) {
      // Best-effort browser notification (toast). Browsers may block it;
      // if so we simply rely on the in-app panel.
      const gw = (globalThis as unknown as { Notification?: { permission: string; requestPermission: () => Promise<string>; new (t: string, o: object): void } }).Notification;
      const nav = (globalThis as unknown as { navigator?: { serviceWorker?: { ready: Promise<unknown> } } }).navigator;
      if (gw && gw.permission === 'granted') {
        try {
          new gw(content.title, { body: content.body, tag: `upload-${content.uploadId}` });
        } catch {
          // Fall through to pushing a ServiceWorker notification when possible.
          if (nav?.serviceWorker?.ready) {
            const reg = await nav.serviceWorker.ready;
            void (reg as unknown as { showNotification: (t: string, o: object) => void })
              .showNotification(content.title, { body: content.body, tag: `upload-${content.uploadId}` });
          }
        }
      } else if (gw && gw.permission === 'default' && content.done) {
        // Only prompt for permission when the upload reaches a terminal state.
        gw.requestPermission().catch?.(() => {});
      }
      return;
    }

    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: notifId(content.uploadId),
      content: {
        title: content.title,
        body: content.body,
        data: { uploadId: content.uploadId, type: 'upload', ...(content.done ? { done: content.done } : {}) },
      },
      trigger: null,
    });
  } catch {
    // Non-fatal — the in-app upload panel still shows progress.
  }
}

function presentProgress(u: BackgroundUpload, pct: number): void {
  void notify({
    title: `Uploading ${u.label}`,
    body: `${u.fileName || 'Your upload'} · ${pct}% uploaded`,
    uploadId: u.uploadId,
  });
}

function presentComplete(u: BackgroundUpload): void {
  void notify({
    title: 'Upload complete',
    body:
      u.label === 'video'
        ? 'Your video has finished uploading and is ready.'
        : 'Your upload has finished and is ready.',
    uploadId: u.uploadId,
    done: 'complete',
  });
}

function presentFailed(u: BackgroundUpload, message: string): void {
  void notify({
    title: 'Upload failed',
    body: message || 'Your upload could not be completed. Please try again.',
    uploadId: u.uploadId,
    done: 'failed',
  });
}

// ─── Persistence ────────────────────────────────────────────────────────────

function persist(): void {
  const arr = Array.from(active.values()).map((j) => j.upload);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(arr)).catch(() => {});
}

const VALID_STATUSES = new Set(['uploading', 'complete', 'failed']);

/**
 * Validate + normalise a persisted upload record. Returns null for anything
 * malformed/corrupt so a bad record is DROPPED at the boundary and can never
 * reach the UI (or crash a screen that reads its fields).
 */
function sanitizeRecord(u: unknown): BackgroundUpload | null {
  if (!u || typeof u !== 'object') return null;
  const rec = u as Record<string, unknown>;
  if (typeof rec.uploadId !== 'string' || !rec.uploadId) return null;
  const status: UploadStatus | null =
    typeof rec.status === 'string' && VALID_STATUSES.has(rec.status)
      ? (rec.status as UploadStatus)
      : null;
  if (!status) return null;
  const progress = Number.isFinite(rec.progress) ? Math.max(0, Math.min(1, Number(rec.progress))) : 0;
  return {
    uploadId: rec.uploadId,
    label: typeof rec.label === 'string' ? rec.label : 'upload',
    fileName: typeof rec.fileName === 'string' ? rec.fileName : 'Your upload',
    fileUri: typeof rec.fileUri === 'string' ? rec.fileUri : '',
    previewUri: typeof rec.previewUri === 'string' ? rec.previewUri : undefined,
    mediaType: rec.mediaType === 'image' || rec.mediaType === 'video' ? rec.mediaType : 'file',
    progress,
    status,
    startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : new Date().toISOString(),
    error: typeof rec.error === 'string' ? rec.error : undefined,
    recoverable: rec.recoverable === false ? false : true,
  };
}

async function restore(): Promise<BackgroundUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeRecord)
      .filter((u): u is BackgroundUpload => u !== null);
  } catch {
    return [];
  }
}

function snapshot(): BackgroundUpload[] {
  return Array.from(active.values()).map((j) => j.upload);
}

function emit(): void {
  const s = snapshot();
  listeners.forEach((l) => l(s));
  persist();
}

// ─── Terminal auto-dismiss ───────────────────────────────────────────────────
// The toast/status lifecycle: an upload stays on screen WHILE active, and when
// it reaches complete/failed it stays for TERMINAL_DISMISS_MS (offering the
// completion state / a retry) and then auto-dismisses. The timer is cleared on
// retry/cancel so a re-run upload is never dismissed mid-flight.

function clearDismiss(uploadId: string): void {
  const t = dismissTimers.get(uploadId);
  if (t) {
    clearTimeout(t);
    dismissTimers.delete(uploadId);
  }
}

function scheduleDismiss(uploadId: string, ms = TERMINAL_DISMISS_MS): void {
  clearDismiss(uploadId);
  dismissTimers.set(
    uploadId,
    setTimeout(() => {
      dismissTimers.delete(uploadId);
      if (active.has(uploadId)) {
        active.delete(uploadId);
        emit(); // removes from the queue + persisted state
      }
    }, ms),
  );
}

// ─── Job execution ──────────────────────────────────────────────────────────

async function execute(job: Job): Promise<void> {
  const u = job.upload;
  u.status = 'uploading';
  u.error = undefined;
  u.progress = 0;
  emit();

  // Update the native progress notification at most ~once per second so a busy
  // upload doesn't spam the notification centre.
  let lastNotif = 0;

  // The upload's TRUE outcome is decided SOLELY by whether `run` succeeds.
  // Notification presentation is fire-and-forget and never throws into this
  // flow: even if device notifications are unavailable (web, permission
  // denied), a completed upload stays 'complete' and a failed one stays
  // 'failed' with its real error.
  try {
    await job.run((p: number) => {
      u.progress = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
      const now = Date.now();
      if (now - lastNotif > 1000 && u.progress < 1) {
        lastNotif = now;
        presentProgress(u, Math.round(Math.min(u.progress, 0.99) * 100));
      }
      emit();
    });
    u.status = 'complete';
    u.progress = 1;
  } catch (e) {
    // A cancelled upload was already removed from the queue by cancel() — it
    // must never be re-surfaced as a failure (or fire a failure notification).
    if (!active.has(u.uploadId)) return;
    u.status = 'failed';
    u.error = e instanceof Error ? e.message : 'Upload failed. Please try again.';
    u.recoverable = !isUnrecoverableUploadError(e);
  }
  emit();

  if (u.status === 'complete') {
    presentComplete(u);
    // Stay visible ("Upload complete") for TERMINAL_DISMISS_MS, then dismiss.
    scheduleDismiss(u.uploadId);
  } else {
    presentFailed(u, u.error ?? '');
    // Keep the retry available for TERMINAL_DISMISS_MS, then auto-dismiss.
    scheduleDismiss(u.uploadId);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const uploadManager = {
  /**
   * Register + start a background upload. The job's `run` does the actual work
   * (media upload, thumbnail, post creation) and reports overall progress. The
   * promise chain in `run` keeps progressing even after the calling screen
   * unmounts, so the upload survives navigation within the app.
   */
  start(config: Omit<BackgroundUpload, 'progress' | 'status' | 'startedAt'> & {
    run: (onProgress: (p: number) => void) => Promise<void>;
    abort?: () => void;
  }): string {
    const { run, abort, ...meta } = config;
    const upload: BackgroundUpload = {
      ...meta,
      progress: 0,
      status: 'uploading',
      startedAt: new Date().toISOString(),
    };
    const job: Job = { upload, run, abort };
    // A repeated start for the same uploadId replaces the running job (so a
    // retry never stacks), but never for a fresh id.
    const existing = active.get(upload.uploadId);
    if (existing && existing.upload.status === 'uploading') {
      return upload.uploadId;
    }
    active.set(upload.uploadId, job);
    emit();
    void execute(job);
    return upload.uploadId;
  },

  /**
   * Register a job that is ALREADY running under a screen (the foreground
   * publish in create-post) so the manager owns its state/progress/notifications
   * WITHOUT re-executing it. The screen keeps running job.run() and must drive
   * the manager via reportProgress / finish / fail. This is what lets "Upload
   * in background" hand over the in-flight upload instead of starting a second
   * (duplicate) one.
   */
  adopt(config: Omit<BackgroundUpload, 'progress' | 'status' | 'startedAt'> & {
    run: (onProgress: (p: number) => void) => Promise<void>;
    abort?: () => void;
  }): string {
    const { run, abort, ...meta } = config;
    if (active.has(meta.uploadId)) return meta.uploadId;
    const upload: BackgroundUpload = {
      ...meta,
      progress: 0,
      status: 'uploading',
      startedAt: new Date().toISOString(),
    };
    active.set(meta.uploadId, { upload, run, abort });
    emit();
    return meta.uploadId;
  },

  /** Feed progress for an adopted/registered job (throttles native notifs). */
  reportProgress(uploadId: string, p: number): void {
    const job = active.get(uploadId);
    if (!job) return;
    const u = job.upload;
    u.progress = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    emit();
  },

  /** Mark an adopted job complete + fire its completion notification. */
  finish(uploadId: string): void {
    const job = active.get(uploadId);
    if (!job) return;
    const u = job.upload;
    u.status = 'complete';
    u.progress = 1;
    emit();
    presentComplete(u);
    // Stay visible ("Upload complete") for TERMINAL_DISMISS_MS, then dismiss.
    scheduleDismiss(uploadId);
  },

  /** Mark an adopted job failed + fire its failure notification. */
  fail(uploadId: string, error: unknown): void {
    const job = active.get(uploadId);
    if (!job) return;
    const u = job.upload;
    u.status = 'failed';
    u.error = error instanceof Error ? error.message : 'Upload failed. Please try again.';
    u.recoverable = !isUnrecoverableUploadError(error);
    emit();
    presentFailed(u, u.error);
    // Keep the retry available for TERMINAL_DISMISS_MS, then auto-dismiss.
    scheduleDismiss(uploadId);
  },

  /**
   * Cancel an upload: abort the in-flight request/multipart upload, clean up
   * the R2 session server-side, and remove the job from the queue + persisted
   * state. A cancelled upload can never resume or be retried.
   */
  cancel(uploadId: string): void {
    clearDismiss(uploadId);
    const job = active.get(uploadId);
    if (!job) {
      // Not a live job (e.g. a restored/stale record) — just make sure no
      // lingering queue/persisted state survives the tap.
      emit();
      return;
    }
    try {
      job.abort?.();
    } catch {
      // Never throw out of cancel — the job is removed regardless.
    }
    active.delete(uploadId);
    emit();
  },

  getActive(): BackgroundUpload[] {
    return snapshot();
  },

  get(uploadId: string): BackgroundUpload | undefined {
    return active.get(uploadId)?.upload;
  },

  /** Re-run a failed upload. No-op unless the job is in a failed state. */
  retry(uploadId: string): void {
    const job = active.get(uploadId);
    if (!job || job.upload.status !== 'failed') return;
    // Retry within the dismiss window — cancel the pending auto-dismiss so the
    // re-run upload is never removed mid-flight.
    clearDismiss(uploadId);
    void execute(job);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Rehydrate persisted uploads (for screens that re-open after leaving).
   * Records a process *was* killed mid-upload cannot resume (the JS runtime that
   * held the in-flight request is gone), so such entries are surfaced as failed
   * with a clear “interrupted” message rather than stuck on “uploading” forever.
   *
   * Restored records can never be retried or resumed (their in-memory job and
   * file handle are gone), so every surfaced record is removed from storage
   * immediately — a stale/corrupt record can never resurrect on the next launch
   * or block the queue.
   */
  async restoreActive(): Promise<BackgroundUpload[]> {
    const persisted = await restore();
    if (persisted.length > 0) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
    return persisted.map((u) => {
      if (u.status === 'uploading') {
        return {
          ...u,
          status: 'failed' as const,
          error: 'Upload was interrupted.',
        };
      }
      return u;
    });
  },

  clearPersisted(): void {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
};

// ─── Section-scoped recovery ────────────────────────────────────────────────
// Any media subsystem can request a broken upload be terminated cleanly
// (e.g. the create screen flags an unrecoverable job). cancel() does the real
// cleanup: abort the in-flight request, abort the R2 session server-side, and
// remove the job from the queue + persisted state — a broken upload can never
// stay in the queue and interfere with future uploads.
mediaRecovery.on((event) => {
  if (event.type === 'upload-reset') {
    uploadManager.cancel(event.uploadId);
  }
});

// ─── React hook ─────────────────────────────────────────────────────────────

const EMPTY: BackgroundUpload[] = [];

export function useBackgroundUploads(): {
  uploads: BackgroundUpload[];
  start: typeof uploadManager.start;
  retry: typeof uploadManager.retry;
  cancel: typeof uploadManager.cancel;
} {
  const [uploads, setUploads] = useState<BackgroundUpload[]>(EMPTY);
  const seenAtMount = useRef(false);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = uploadManager.subscribe((s) => setUploads(s));
    // Hydrate from memory + persisted state so a returning screen rediscovers
    // any uploads that are still in flight (or failed and await a retry).
    if (!seenAtMount.current) {
      seenAtMount.current = true;
      const live = uploadManager.getActive();
      if (Array.isArray(live) && live.length > 0) {
        setUploads(live);
      } else {
        void uploadManager.restoreActive().then((persisted) => {
          if (persisted.length === 0) return;
          const restoredIds = new Set(persisted.map((u) => u.uploadId));
          setUploads(persisted);
          // Restored records are terminal (they can't resume/retry), so they
          // follow the same 10-second auto-dismiss as live terminal uploads.
          restoreTimerRef.current = setTimeout(() => {
            restoreTimerRef.current = null;
            setUploads((prev) => prev.filter((u) => !restoredIds.has(u.uploadId)));
          }, TERMINAL_DISMISS_MS);
        });
      }
    }
    return () => {
      unsub();
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    };
  }, []);

  return { uploads, start: uploadManager.start, retry: uploadManager.retry, cancel: uploadManager.cancel };
}