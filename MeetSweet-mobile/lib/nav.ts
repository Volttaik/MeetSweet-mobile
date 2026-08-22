/**
 * Navigation helpers — prevent duplicate screen stacking.
 *
 * `pushOnce` / `replaceOnce` ignore a second navigation to the same route
 * within a short window, so a rapid series of taps (e.g. tapping "Creator
 * Dashboard" five times) can never stack multiple copies of the same screen.
 * Navigation to different screens is unaffected.
 */
import { router, type Href } from 'expo-router';

const DEDUPE_MS = 700;
const lastNav: Record<string, number> = {};

function navKey(href: Href): string {
  if (typeof href === 'string') return href;
  return href.pathname;
}

function allow(href: Href): boolean {
  const key = navKey(href);
  const now = Date.now();
  if (lastNav[key] && now - lastNav[key] < DEDUPE_MS) return false;
  lastNav[key] = now;
  return true;
}

export function pushOnce(href: Href): void {
  if (allow(href)) router.push(href);
}

export function replaceOnce(href: Href): void {
  if (allow(href)) router.replace(href);
}

// ─── Navigator readiness gate ────────────────────────────────────────────────
//
// Navigating from OUTSIDE a component (notification tap handlers, deep-link
// resolvers) can race the app's initial route resolution: on cold start the
// root index Redirect to (tabs) is still settling, and on background-resume
// the view hierarchy is still coming back. A push issued during that window
// can mount the target screen on an inconsistent stack — it renders, but
// touches/gestures are dead. Deferring such navigation until the navigator is
// marked ready (root layout) eliminates the race.

let _navigatorReady = false;
const _readyWaiters: Array<() => void> = [];

/** Called by the root layout once the initial route has settled. */
export function markNavigatorReady(): void {
  _navigatorReady = true;
  _readyWaiters.splice(0).forEach((w) => {
    try {
      w();
    } catch {
      // A failed deferred navigation must never break the waiter loop.
    }
  });
}

/**
 * Run `fn` once the navigator is ready. If it never becomes ready (missed
 * signal), fall back to running after a short bound so navigation is never
 * held hostage.
 */
export function whenNavigatorReady(fn: () => void): void {
  if (_navigatorReady) {
    fn();
    return;
  }
  _readyWaiters.push(fn);
  setTimeout(() => {
    const i = _readyWaiters.indexOf(fn);
    if (i >= 0) {
      _readyWaiters.splice(i, 1);
      fn();
    }
  }, 2500);
}
