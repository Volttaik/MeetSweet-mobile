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
