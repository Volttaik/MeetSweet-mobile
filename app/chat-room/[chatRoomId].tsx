/**
 * Chat Room Screen — /chat-room/[chatRoomId]
 *
 * Room-based messaging: the backend owns the chatRoomId; this screen receives
 * ONLY the chatRoomId and resolves everything else (participants, messages,
 * media, read/clear state) FROM the room. The other participant is identified
 * from room.participants + currentUser.id — never from navigation params.
 *
 * Re-exports the implementation from the chat screen module (single source of
 * truth for the chat UI). Navigation to /chat/:id is migrated to this route.
 */
export { default } from '../chat/[id]';
