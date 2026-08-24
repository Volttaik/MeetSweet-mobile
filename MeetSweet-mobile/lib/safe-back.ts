/**
 * safe-back.ts — guarded back navigation.
 *
 * `router.back()` fires an unhandled GO_BACK (dev-only warning, broken UX)
 * when there is no previous screen in the stack — e.g. the user deep-linked
 * straight into a screen on web, or refreshed mid-session. Instead of
 * crashing the gesture, fall back to a known home route so the user always
 * lands somewhere real.
 */
import { router } from 'expo-router';

type Route = Parameters<typeof router.replace>[0];

/**
 * Go back if history exists; otherwise replace with `fallback`
 * (defaults to the main tabs). Works in onPress handlers and effects alike.
 */
export function goBack(fallback: Route = '/(tabs)'): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
