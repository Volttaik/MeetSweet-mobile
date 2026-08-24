/**
 * Chat focus — which chat room the user is actively viewing (module-level, so
 * the expo-notifications foreground handler can read it without React state).
 *
 * The DM screen sets this on mount / clears on unmount. The push handler
 * suppresses the OS banner for a message that arrives in the room the user is
 * currently looking at — the realtime event already rendered it, so a native
 * notification for the same conversation is noise.
 */

let focusedRoomId: string | null = null;

export function setFocusedChatRoom(roomId: string | null): void {
  focusedRoomId = roomId;
}

export function getFocusedChatRoom(): string | null {
  return focusedRoomId;
}
