/**
 * media-recovery — section-scoped restart/recovery bus for media subsystems.
 *
 * When a media operation breaks (playback stall, frozen Shorts feed, broken
 * upload), the AFFECTED subsystem resets itself and starts fresh. Each event
 * targets ONE subsystem and ONE resource — this module never touches auth,
 * preferences, or unrelated cached content:
 *
 *   restartVideoPlayer(videoId)  → that player instance releases its native
 *                                  player, clears its own cached file and
 *                                  reloads the video.
 *   restartShortsFeed()          → the Shorts screen clears ONLY its feed cache
 *                                  and refetches.
 *   resetUpload(uploadId)        → the upload manager terminates that job and
 *                                  removes its queue/persisted state.
 *
 * Consumers subscribe via `on()` and filter by event type. This is a tiny
 * in-process emitter — no persistence, no global side effects.
 */

export type MediaRecoveryEvent =
  | { type: 'video-restart'; videoId: string }
  | { type: 'shorts-feed-restart' }
  | { type: 'upload-reset'; uploadId: string };

type Handler = (event: MediaRecoveryEvent) => void;

const handlers = new Set<Handler>();

function emit(event: MediaRecoveryEvent): void {
  handlers.forEach((h) => {
    try {
      h(event);
    } catch (e) {
      // A handler must never break the other subscribers.
      console.warn('[media-recovery] handler error', e);
    }
  });
}

export const mediaRecovery = {
  /** Restart ONE video player instance (releases + reloads its native player). */
  restartVideoPlayer(videoId: string): void {
    if (!videoId) return;
    emit({ type: 'video-restart', videoId });
  },

  /** Reset the Shorts feed section: clear its feed cache and refetch fresh. */
  restartShortsFeed(): void {
    emit({ type: 'shorts-feed-restart' });
  },

  /** Terminate a broken upload cleanly (job removed, session aborted). */
  resetUpload(uploadId: string): void {
    if (!uploadId) return;
    emit({ type: 'upload-reset', uploadId });
  },

  /** Subscribe to recovery events. Returns an unsubscribe function. */
  on(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },
};
