/**
 * Deep-link startup priority — lib/deep-link.ts
 *
 * Share links (`meetsweet://s/:token` or `https://meetsweet.space/s/:token`)
 * must win the race against normal startup/onboarding. The app's initial route
 * (app/index.tsx) holds its redirect until the launch URL is known and then
 * goes straight to the share resolver instead of the home feed / welcome flow.
 *
 * This module also keeps a "pending share destination" so a logged-out
 * recipient who later signs in is returned to the content they were sent
 * instead of being dropped into onboarding.
 */
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

export interface ShareDestination {
  type: 'post' | 'video' | 'short' | 'album' | 'creator';
  id: string;
}

// ─── Launch URL → share token ────────────────────────────────────────────────

let listenerAttached = false;
/** undefined = not resolved yet; null = resolved, not a share link. */
let initialToken: string | null | undefined;
let initialReferralCode: string | null | undefined;
let resolveInitial: (token: string | null) => void = () => {};
let resolveInitialReferral: (code: string | null) => void = () => {};
const initialTokenPromise = new Promise<string | null>((resolve) => {
  resolveInitial = resolve;
});
const initialReferralPromise = new Promise<string | null>((resolve) => {
  resolveInitialReferral = resolve;
});

/** Pull the share token out of a launch URL (`…/s/TOKEN`). */
export function parseShareToken(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const clean = url.split(/[?#]/)[0];
    const match = clean.match(/\/s\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Pull the referral code out of a launch URL (`…/r/CODE`). */
export function parseReferralCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const clean = url.split(/[?#]/)[0];
    const match = clean.match(/\/r\/([^/]+)\/?$/i);
    const code = match ? decodeURIComponent(match[1]).trim().toUpperCase() : null;
    return code && /^[A-Z0-9]{6,32}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * The share token the app was launched with (cold start), resolved once and
 * cached. Warm starts also count: a link tapped while the app is running
 * updates the cached value so downstream screens see the share arrival.
 */
export function getInitialShareToken(): Promise<string | null> {
  if (!listenerAttached) {
    listenerAttached = true;
    Linking.getInitialURL()
      .then((url) => {
        // A URL event may have already resolved the token (warm start raced
        // ahead) — never overwrite it with the cold-start (null) result.
        if (initialToken === undefined) {
          initialToken = parseShareToken(url);
          initialReferralCode = parseReferralCode(url);
          resolveInitial(initialToken);
          resolveInitialReferral(initialReferralCode);
        }
      })
      .catch(() => {
        if (initialToken === undefined) {
          initialToken = null;
          initialReferralCode = null;
          resolveInitial(null);
          resolveInitialReferral(null);
        }
      });

    Linking.addEventListener('url', ({ url }) => {
      const token = parseShareToken(url);
      const referralCode = parseReferralCode(url);
      if (token) {
        initialToken = token;
        resolveInitial(token);
      }
      if (referralCode) {
        const wasAlreadyResolved = initialReferralCode !== undefined;
        initialReferralCode = referralCode;
        resolveInitialReferral(referralCode);
        // Warm-start referral link: if the app was already running, we need
        // to check session awareness. Import here to avoid circular deps.
        if (wasAlreadyResolved) {
          // Dynamic import to avoid circular dependency with AuthContext
          import('@/lib/session-storage').then(({ getAccessToken }) => {
            getAccessToken().then((token) => {
              if (token) {
                // User is already logged in — show alert and stay on current screen
                const { Alert } = require('react-native');
                Alert.alert(
                  'Already a member',
                  'You already have a MeetSweet account.',
                );
              } else {
                // Not logged in — go to registration with referral
                router.replace({ pathname: '/register', params: { referral: referralCode } });
              }
            });
          }).catch(() => {
            router.replace({ pathname: '/register', params: { referral: referralCode } });
          });
        }
      }
    });
  }
  return initialTokenPromise;
}

/** True once we know the app was opened via a share link (cold or warm start). */
export function getInitialReferralCode(): Promise<string | null> {
  if (!listenerAttached) void getInitialShareToken();
  return initialReferralPromise;
}

export async function wasOpenedViaShareLink(): Promise<boolean> {
  return (await getInitialShareToken()) !== null;
}

// ─── Pending destination (restore after login) ───────────────────────────────

let pendingDestination: ShareDestination | null = null;

/** Remember where a logged-out share recipient was headed. */
export function setPendingShareDestination(dest: ShareDestination | null): void {
  pendingDestination = dest;
}

/** Take (and clear) the stored destination, e.g. right after a successful login. */
export function consumePendingShareDestination(): ShareDestination | null {
  const dest = pendingDestination;
  pendingDestination = null;
  return dest;
}

// ─── Destination routing (single source of truth) ────────────────────────────

/** Navigate to the screen represented by a resolved share destination. */
export function routeToShareDestination(
  dest: ShareDestination,
  method: 'replace' | 'push' = 'replace',
): void {
  const navigate = method === 'replace' ? router.replace : router.push;
  switch (dest.type) {
    case 'video':
      navigate(`/videos/${dest.id}`);
      break;
    case 'short':
      navigate({ pathname: '/shorts', params: { startId: dest.id } });
      break;
    case 'album':
      navigate(`/album/${dest.id}`);
      break;
    case 'creator':
      navigate(`/creator/${dest.id}`);
      break;
    case 'post':
    default:
      navigate(`/post/${dest.id}`);
      break;
  }
}
