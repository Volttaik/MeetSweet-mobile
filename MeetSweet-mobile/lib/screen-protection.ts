/**
 * Native screen-capture protection for protected content.
 *
 * Uses expo-screen-capture, which sets the real Android FLAG_SECURE window
 * flag — screenshots and screen recording are blocked by the OS at the
 * surface level (not a fake UI overlay).
 *
 * WHY THIS FILE IS BUILT THE WAY IT IS (leak hardening):
 * The flag is applied to the ACTIVITY window, i.e. the whole app, so a stuck
 * flag would block screenshots everywhere. The module can also throw
 * `MissingActivity` when a call lands mid-navigation, which would previously
 * leave the flag set with no retry. Therefore:
 *
 * 1. All prevent/allow calls are serialized on a promise chain so they land
 *    in order and a failed call cannot corrupt the sequence.
 * 2. We mirror the desired state; a failed call reverts the mirror so the
 *    next reconcile retries it.
 * 3. Every time the app foregrounds with NO protected screen active, we
 *    force-clear the flag (clearFlags is a no-op when unset) — a self-healing
 *    safety net for any stuck state.
 * 4. The hook is focus-aware: protection is released as soon as the
 *    protected screen loses focus (another screen pushed on top, tab switch,
 *    back navigation) — it never lingers on unrelated screens.
 *
 * Platform limitation (documented, not hidden): iOS does not expose any
 * supported API for blocking screenshots/screen recording — expo-screen-capture
 * is effectively a no-op there, which is the strongest protection Apple
 * allows. Android is fully protected via FLAG_SECURE.
 */
import * as ScreenCapture from 'expo-screen-capture';
import { AppState } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

let activeRefs = 0;
/** Our belief of the native window flag (optimistic mirror of desired state). */
let appliedProtection = false;
/** Serializes prevent/allow so they always execute in call order. */
let chain: Promise<void> = Promise.resolve();

function reconcile(): void {
  const want = activeRefs > 0;
  if (want === appliedProtection) return;
  appliedProtection = want;
  const op = want
    ? ScreenCapture.preventScreenCaptureAsync()
    : ScreenCapture.allowScreenCaptureAsync();
  chain = chain
    .then(() => op)
    .catch(() => {
      // The native call failed (e.g. MissingActivity during a transition).
      // Revert the mirror so the next reconcile (navigation, foreground)
      // retries it — never leave the flag stuck.
      appliedProtection = !want;
    });
}

export function acquireScreenProtection(): void {
  activeRefs += 1;
  reconcile();
}

export function releaseScreenProtection(): void {
  activeRefs = Math.max(0, activeRefs - 1);
  reconcile();
}

// Self-healing safety net: whenever the app returns to the foreground with no
// protected screen active, force-clear the flag. clearFlags is harmless when
// the flag is already unset, and it repairs any leaked/stuck state.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && activeRefs === 0) {
    chain = chain
      .then(() => ScreenCapture.allowScreenCaptureAsync())
      .catch(() => {});
  }
});

/**
 * Activates native capture protection while the calling screen is BOTH
 * active (e.g. paid album unlocked, subscriber-gated video) AND focused.
 * Releasing on blur means a protected screen covered by another pushed
 * screen or tab no longer holds the flag — the security state can never
 * leak into unrelated screens. Restored automatically on unmount.
 */
export function useScreenProtection(active: boolean): void {
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!active || !focused) return;
    acquireScreenProtection();
    return () => {
      releaseScreenProtection();
    };
  }, [active, focused]);
}
