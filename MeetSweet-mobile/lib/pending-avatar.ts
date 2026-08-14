/**
 * pending-avatar.ts — defer the profile avatar upload until after login.
 *
 * Registration happens before the user is authenticated, but the media upload
 * endpoint requires a session. Instead of sending a device-local file:// URI as
 * `avatar_url` (which the server would persist as a broken, unrenderable URL),
 * we stash the chosen image locally — keyed by the signup email — and upload it
 * right after the first successful login.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingAvatar {
  uri: string;
  mimeType?: string;
  fileName?: string;
}

function keyFor(email: string): string {
  return `@ms_pending_avatar_${email.trim().toLowerCase()}`;
}

export async function savePendingAvatar(email: string, avatar: PendingAvatar): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(email), JSON.stringify(avatar));
  } catch {
    // Non-fatal: the avatar is simply not restored if storage is unavailable.
  }
}

export async function consumePendingAvatar(
  email: string | null | undefined,
): Promise<PendingAvatar | null> {
  if (!email) return null;
  try {
    const key = keyFor(email);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    await AsyncStorage.removeItem(key);
    return JSON.parse(raw) as PendingAvatar;
  } catch {
    return null;
  }
}

/** Read the pending avatar without removing it (used before a retryable upload). */
export async function peekPendingAvatar(
  email: string | null | undefined,
): Promise<PendingAvatar | null> {
  if (!email) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(email));
    return raw ? (JSON.parse(raw) as PendingAvatar) : null;
  } catch {
    return null;
  }
}

/** Remove a pending avatar only after the upload has been confirmed server-side. */
export async function clearPendingAvatar(
  email: string | null | undefined,
): Promise<void> {
  if (!email) return;
  try {
    await AsyncStorage.removeItem(keyFor(email));
  } catch {
    // Non-fatal.
  }
}
