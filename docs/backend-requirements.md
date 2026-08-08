# MeetSweet Mobile — Room Architecture Backend Requirements

> **Status:** Mobile migration complete. Backend migration pending.
> This document is the authoritative contract the backend MUST implement so
> the mobile app's Room-based messaging and Comment Rooms work end to end.
>
> **Principle:** *Users do not send messages directly to users. Users send
> messages into a Room.*
>
> **Architecture:** `USER → ROOM → CONTENT` (not `USER → USER → CONVERSATION → MESSAGE`).
> The backend owns room identity. Mobile opens and interacts with rooms.
> Messages/comments belong to rooms. Users = User IDs, Rooms = Room IDs,
> Content = Content IDs.

---

## 1. Chat Rooms

A **Chat Room** is a private 1-to-1 messaging container (participants,
messages, images, videos, audio, documents, read state, clear state, metadata).

### Rules
- The **backend owns Chat Room creation and the authoritative `chatRoomId`**.
  Mobile never generates a room ID.
- **One chat room between two users (A+B == B+A).** The backend must
  deduplicate — POSTing the same participant twice returns the SAME room.
- All messages belong to the room. Mobile identifies the other participant
  from `participants` + `currentUser.id` (room data), **never** from
  navigation params or the screen that opened the chat.
- Clear chat is a **room-level** operation (clears the user's chat state),
  NOT a deletion of the room/relationship/other user. The room remains the
  permanent container.
- The chat list is a **list of Chat Rooms** with lightweight metadata only
  (other user, avatar, latest message, timestamp, unread count,
  `chatRoomId`). It MUST NOT download every room's messages.

### Endpoints

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/chat-rooms` | `{ participant_id }` | `{ chat_room_id, created, chat_room: {...} }` | Returns **existing** room for the pair or **creates** one. `created` boolean. Never returns a duplicate. |
| GET | `/api/chat-rooms?tab=all\|archived` | — | `{ chat_rooms: [ ... ] }` | Lightweight rows: `chat_room_id, other_user, last_message_body, last_message_at, last_message_media_type, last_message_sender_id, unread_count, is_muted, is_archived, updated_at, last_message_id`. **No full messages.** `last_message_media_type` + `last_message_sender_id` let the chat list show contextual previews (`📷 Photo`, `🎥 Video`, `🎤 Voice message`, `📎 Document`, and a `You:` prefix when the current user sent the last message). |
| GET | `/api/chat-rooms/:chatRoomId` | — | `{ chat_room: {...} }` | Authoritative room data: `chat_room_id, participants[], other_user, created_at, updated_at, last_message_id`. |
| GET | `/api/chat-rooms/:chatRoomId/messages` | `?before=<cursor>` or `?after=<cursor>` | `{ messages: [...], has_more }` | `before` = older pagination. `after` = incremental: returns only messages after the marker. |
| POST | `/api/chat-rooms/:chatRoomId/messages` | `{ body, media_url, media_type, caption, file_name, file_size, mime_type, audio_duration, reply_to_id }` | `{ message: {...} }` | Message records `author` (sender) but the **destination is `chatRoomId`**. |
| POST | `/api/chat-rooms/:chatRoomId/read` | — | `200` | Marks current user's unread state read **for this room**. |
| POST | `/api/chat-rooms/:chatRoomId/clear` | — | `200` | Clears current user's chat state. Room stays. |
| GET | `/api/chat-rooms/:chatRoomId/changes` | `?since=<marker>` | `{ changed, marker, messages?: [...] }` | Incremental change check for **one** room. `marker` = `last_message_id`/`updated_at`. Serverless: no typing indicators, no presence, no live cursor. |
| DELETE | `/api/chat-rooms/:chatRoomId/messages/:messageId` | — | `200` | Recall/delete a message inside a room. |
| PATCH | `/api/chat-rooms/:chatRoomId/messages/:messageId` | `{ body }` | `200` | Edit a message body. |
| POST | `/api/chat-rooms/:chatRoomId/messages/:messageId/reactions` | `{ emoji }` | `{ reactions: [{ emoji, user_ids }] }` | Toggle a reaction. |
| PUT | `/api/chat-rooms/:chatRoomId/mute` | `{ muted }` | `200` | Mute/unmute for current user. |
| PUT | `/api/chat-rooms/:chatRoomId/archive` | `{ archived }` | `200` | Archive/unarchive for current user. |
| DELETE | `/api/chat-rooms/:chatRoomId` | — | `200` | Remove room from current user's list (not the other user's copy). |

### Message object shape (mobile expects)

```jsonc
{
  "id": "msg_123",
  "chat_room_id": "room_456",
  "body": "hello",
  "media_url": null,          // or a media URL
  "media_type": "image|video|audio|document|null",
  "audio_duration": 12,       // optional
  "file_name": "a.png",       // optional
  "file_size": 1234,          // optional
  "mime_type": "image/png",   // optional
  "is_deleted": false,
  "is_edited": false,
  "caption": null,            // optional
  "created_at": "2026-08-08T10:00:00Z",
  "sender": {
    "id": "user_1",
    "name": "Alice",
    "username": "alice",
    "avatar_url": "https://..."
  },
  "is_own": true              // resolved for the requesting user
}
```

### Room object shape (mobile expects)

```jsonc
{
  "chat_room_id": "room_456",
  "participants": [ { "id": "user_1", "name": "Alice", "username": "alice", "avatar_url": null } ],
  "other_user": { "id": "user_2", "name": "Bob", "username": "bob", "avatar_url": null },
  "last_message_body": "hello",
  "last_message_at": "2026-08-08T10:00:00Z",
  "unread_count": 2,
  "is_muted": false,
  "is_archived": false,
  "created_at": "2026-07-01T09:00:00Z",
  "updated_at": "2026-08-08T10:00:00Z",
  "last_message_id": "msg_123"
}
```

---

## 2. Comment Rooms

A **Comment Room** is the container for comments belonging to a specific post
(post, comments, authors, media, metadata, settings).

### Rules
- **Every post has a Comment Room.** When a post is created, the backend
  creates/associates a `commentRoomId`. Comments belong to `commentRoomId`,
  NOT user-to-user conversations.
- **Comment Room identity:** `postId → commentRoomId`. Mobile gets
  `commentRoomId` from the POST DATA (`comment_room_id` on the post object) —
  never guessed or derived client-side.
- **Comments ON/OFF:** Post settings support Comments ON/OFF. OFF = users
  cannot submit (mobile UX restriction) **AND backend MUST enforce**
  (security). **Do NOT delete the Comment Room when disabled** — keep it
  associated so it can be re-enabled later.
- **Efficient refresh:** poll ONLY the currently-viewed Comment Room. No
  typing indicators, presence, live cursor, or polling every post. Use the
  change marker (`last_comment_id` / `updated_at`).

### Endpoints

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/posts/:postId` | — | `{ post: { ..., comment_room_id, comments_enabled } }` | Post data includes `comment_room_id` + `comments_enabled`. |
| POST | `/api/posts` | `{ ..., comments_enabled }` | `{ id, comment_room_id }` | Creating a post creates/associates its Comment Room. |
| GET | `/api/comment-rooms/:commentRoomId` | — | `{ comment_room: { comment_room_id, post_id, comments_enabled, comment_count } }` | Room metadata. |
| GET | `/api/comment-rooms/:commentRoomId/comments` | `?after=<marker>` | `{ comments: [...], has_more }` | Incremental: `after` returns only comments after the marker. |
| POST | `/api/comment-rooms/:commentRoomId/comments` | `{ body }` | `{ comment: {...} }` | Comment has `author_id` but destination is `commentRoomId`. **Reject 403 when comments disabled.** |
| GET | `/api/comment-rooms/:commentRoomId/comments/changes` | `?since=<marker>` | `{ changed, marker, comments?: [...] }` | Incremental change check for the viewed room. |
| PUT | `/api/posts/:postId/comments-enabled` | `{ enabled }` | `200` | Post owner only. Does NOT delete the Comment Room. |
| PATCH | `/api/comment-rooms/:commentRoomId/comments/:commentId` | `{ body }` | `200` | Edit a comment. |
| DELETE | `/api/comment-rooms/:commentRoomId/comments/:commentId` | — | `200` | Delete a comment. |
| POST | `/api/comment-rooms/:commentRoomId/comments/:commentId/like` | — | `{ like_count }` | Like a comment. |
| DELETE | `/api/comment-rooms/:commentRoomId/comments/:commentId/like` | — | `{ like_count }` | Unlike a comment. |

### Comment object shape (mobile expects)

```jsonc
{
  "id": "comment_1",
  "comment_room_id": "room_comments_42",
  "body": "Great post!",
  "is_pinned": false,
  "like_count": 3,
  "reply_count": 0,
  "liked_by_me": false,
  "created_at": "2026-08-08T10:00:00Z",
  "updated_at": "2026-08-08T10:00:00Z",
  "author": {
    "id": "user_1",
    "name": "Alice",
    "username": "alice",
    "avatar_url": "https://..."
  }
}
```

---

## 3. Migration notes (backend)

- Replace the Conversation model with Chat Room (`chat_rooms` table) and
  Comment Room (`comment_rooms` table) tables. Keep the pair-uniqueness
  constraint `(participant_a, participant_b)` on chat rooms.
- The old `/api/conversations*` and `/api/posts/:id/comments` routes can be
  removed after the mobile app has fully migrated (mobile no longer calls
  them; the app is room-only now).
- Notification payloads should send `chat_room_id` (mobile still parses
  legacy `conversation_id` as a fallback for in-flight notifications).
- Serverless refresh: implement `changes` endpoints as cheap cursor checks
  (`since` = last message/comment id or `updated_at`), NOT full-list fetches.
- Comments OFF enforcement MUST be server-side (mobile hides the composer,
  but the backend must 403 submissions).
- **Draft persistence (optional, Telegram-style):** if drafts should survive
  across app restarts, expose `PUT /api/chat-rooms/:chatRoomId/draft
  { body }` + include `draft` on the chat-list row. Mobile currently keeps
  drafts only in-memory — this field is a contract extension, not required
  for the core room flow.

---

## 4. What mobile does NOT need (do not build)

- No typing indicators, presence, or live cursors (serverless philosophy).
- No per-post polling — only the currently-viewed room is polled.
- No conversation IDs anywhere in the app.