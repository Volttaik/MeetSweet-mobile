/**
 * Chat background service — type, presets, and persistence.
 *
 * The selected chat background is per (user, chatRoom) so it survives leaving
 * the chat, reopening the app, and never leaks across accounts on a shared
 * device (keyed by the CURRENT user id, matching the app's other
 * client-side per-account settings such as the block list). AsyncStorage is
 * the same local-persistence layer the rest of the profile/settings flow
 * uses; there is no per-room background on the backend, so this stays
 * device-local by design.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatBackground =
  | { type: 'default' }
  | { type: 'color'; value: string }
  | { type: 'gradient'; value: [string, string] }
  | { type: 'image'; uri: string };

export const SOLID_COLORS = [
  '#0C0C0F', '#111827', '#1a1025', '#0d1b2a',
  '#1a0a0a', '#0a1a10', '#1a1400', '#16101c',
];

export const GRADIENTS: [string, string][] = [
  ['#0C0C0F', '#1a0a1a'],
  ['#0d1b2a', '#0a1224'],
  ['#111827', '#1f2a1a'],
  ['#1a0a0a', '#0d0a1a'],
  ['#0a1a10', '#0a0d1a'],
  ['#16101c', '#0a100a'],
];

export const DEFAULT_BACKGROUND: ChatBackground = { type: 'default' };

function bgKey(userId: string | undefined | null, chatRoomId: string): string {
  return `@ms_chat_bg_${userId ?? 'anon'}_${chatRoomId}`;
}

/** Read the persisted background for a (user, room). Defaults to 'default'. */
export async function getChatBackground(
  chatRoomId: string,
  userId?: string | null,
): Promise<ChatBackground> {
  try {
    const raw = await AsyncStorage.getItem(bgKey(userId, chatRoomId));
    if (raw) {
      const parsed = JSON.parse(raw) as ChatBackground;
      if (parsed && typeof parsed === 'object' && parsed.type) return parsed;
    }
  } catch {
    // ignore corrupt entries
  }
  return DEFAULT_BACKGROUND;
}

/** Persist the selected background for a (user, room). */
export async function setChatBackground(
  chatRoomId: string,
  userId: string | undefined | null,
  bg: ChatBackground,
): Promise<void> {
  try {
    await AsyncStorage.setItem(bgKey(userId, chatRoomId), JSON.stringify(bg));
  } catch {
    // non-fatal — the selection just won't persist
  }
}

/** Remove the persisted background for a (user, room) (room delete / clear). */
export async function clearChatBackground(
  chatRoomId: string,
  userId?: string | null,
): Promise<void> {
  try {
    await AsyncStorage.removeItem(bgKey(userId, chatRoomId));
  } catch {
    // non-fatal
  }
}
