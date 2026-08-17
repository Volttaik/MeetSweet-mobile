/**
 * Native screen-capture protection for protected content.
 *
 * Uses expo-screen-capture, which sets the real Android FLAG_SECURE window
 * flag — screenshots and screen recording are blocked by the OS at the
 * surface level (not a fake UI overlay). The flag is ref-counted so nested
 * protected surfaces (e.g. a fullscreen media modal open over a paid album)
 * never release protection while another protected screen is still visible.
 *
 * Platform limitation (documented, not hidden): iOS does not expose any
 * supported API for blocking screenshots/screen recording — expo-screen-capture
 * is effectively a no-op there, which is the strongest protection Apple
 * allows. Android is fully protected via FLAG_SECURE.
 */
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';

let activeRefs = 0;

export async function acquireScreenProtection(): Promise<void> {
  activeRefs += 1;
  if (activeRefs === 1) {
    try {
      await ScreenCapture.preventScreenCaptureAsync();
    } catch {
      // Best-effort per platform — never crash the player over capture flags.
    }
  }
}

export async function releaseScreenProtection(): Promise<void> {
  activeRefs = Math.max(0, activeRefs - 1);
  if (activeRefs === 0) {
    try {
      await ScreenCapture.allowScreenCaptureAsync();
    } catch {
      // Best-effort.
    }
  }
}

/**
 * Activates native capture protection while `active` is true and restores the
 * normal window state when it turns false or the screen unmounts, so the
 * security state never leaks into unrelated screens.
 */
export function useScreenProtection(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    acquireScreenProtection();
    return () => {
      releaseScreenProtection();
    };
  }, [active]);
}
