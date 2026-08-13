# MeetSweet Messaging System — Forensic Code Review

## Scope and method

This is a source-code audit of the mobile messaging system. No application source
code was modified. Findings are based on the execution paths in the checked-in
TypeScript/TSX source, not on comments, previous reports, or feature names.

The audit covered:

- `app/chat-room/[chatRoomId].tsx`
- `app/(tabs)/messages.tsx`
- `services/room-service.ts`
- `services/chat-cache.ts`
- `services/chat-media.ts`
- `services/users.ts`
- `types/chat-message.ts`
- `components/chat/*`
- `components/MsAttachmentSheet.tsx`
- `components/MsUserProfileSheet.tsx`

This is a static audit. It does not claim that the live backend currently
implements the documented endpoints, and it does not substitute for a
two-account integration test.

## Executive Summary

The mobile application is **not a fake implementation overall**. The current
client has a real Chat Room service, server-returned room IDs, room-scoped
message requests, real media upload calls, SQLite/AsyncStorage cache paths,
native file persistence, message pagination, and a scoped polling design.
There is no active user-to-user conversation service path in the inspected
messaging code.

However, the implementation is not presently safe to classify as fully
functional or architecturally verified. The most important weaknesses are:

1. The server-controlled Context ID / Context Auth model is optionalized by a
   broad catch-all fallback. If `/context` fails for any reason, the client
   renders the ordinary messages response without a context membership check.
2. The custom message bubble does not consume or attach the
   `onLongPressMessage` prop passed by the screen. The long-press menu therefore
   has no proven entry path through the custom bubble, and the custom reaction
   strip is rendered without its `onPress` handler.
3. Room polling only adds new messages. It does not reconcile edits, deletions,
   delete-for-me/delete-for-everyone context changes, or reaction changes.
4. Clear Chat optimistically clears local state and swallows a failed server
   response, leaving the client able to present a locally cleared room even
   though the server may still contain the user's context.
5. Block/unblock calls user block endpoints, but the room's blocked state is
   stored and enforced locally. The client does not request or consume a
   room-level inactive/blocked state, and polling is not stopped while blocked.
6. The message service declares `fileType` and `isVoiceNote` fields but does not
   send them in the message request. Audio/voice metadata can therefore be lost
   after a reload, especially when a stored media URL has no recognizable
   extension.

The result is a real but incomplete room-based client. Normal text send, room
creation, initial room/message loading, and several local media paths are
connected. Cross-device synchronization and context-sensitive operations are
not proven end to end.

## Architecture Verified

### Chat Room

**Status: VERIFIED at the client request layer; backend deduplication not
verified.**

- `app/(tabs)/messages.tsx:174-211`, `NewMessageModal.handleSelect`, resolves a
  searched recipient by `user.id`, calls `getOrCreateChatRoom(user.id)`, and
  navigates only with the returned `chatRoomId`.
- `app/creator/[id].tsx:480-557` follows the same participant-ID-to-room flow.
- `services/room-service.ts:465-486`, `getOrCreateChatRoom`, sends
  `POST /chat-rooms` with `{ participant_id }` and rejects a response without a
  returned room ID.
- `app/chat-room/[chatRoomId].tsx:162-193` opens the room from the route room ID
  and sends messages under that ID.

No client-generated authoritative room ID, hardcoded room ID, or legacy
conversation service call was found in the inspected messaging path. The
client cannot prove that the backend returns the same room for A+B and B+A;
that is a backend behavior.

### Participants

**Status: PARTIALLY VERIFIED.**

`app/chat-room/[chatRoomId].tsx:527-563` calls `getChatRoom(chatRoomId)`,
selects the participant whose ID differs from `user.id`, and hydrates the
header/profile sheet from that room data. The route does not accept name,
username, or avatar parameters.

The fallback at lines 549-560 uses the cached room if the authoritative room
request fails. That is reasonable for degraded display, but it means the
header can show stale participant data. The profile sheet at
`components/MsUserProfileSheet.tsx:64-67` routes by username and does not
validate the resolved user type before using `/creator/:username`.

### Context IDs

**Status: PRESENT and mirrored; not required for the main flow.**

- `services/room-service.ts:76-102` models a server-returned `contextId` on
  `ChatRoom`.
- `services/room-service.ts:193-210` models `RoomContext`.
- `services/chat-cache.ts:383-462` stores context data by the composite
  `(chatRoomId, userId)` key.
- `app/chat-room/[chatRoomId].tsx:394-411` fetches and caches the requesting
  user's context.

The client does not invent context IDs. It does, however, permit the entire
message flow to continue when context retrieval fails. See ISSUE-002.

### Context Auth / Auth Trees

**Status: PARTIALLY IMPLEMENTED.**

`services/room-service.ts:167-190` represents `messageIds`,
`removedMessageIds`, and a marker. `app/chat-room/[chatRoomId].tsx:394-431`
mirrors the server response into SQLite and applies server-directed removals
before rendering the initial server page. `services/chat-cache.ts:464-525`
removes local message rows and membership IDs for the requesting user.

The implementation is only effective when `/context` succeeds. The service
catches every error and returns `null`, not just an unavailable-endpoint
response. The room then falls back to ordinary message fetch behavior.

### Messages

**Status: CONNECTED for ordinary server-confirmed sends; partially connected
for metadata and persistence.**

The text path is:

```text
MsChatInputBar send
→ app/chat-room/[chatRoomId].tsx:690-718 handleSend
→ sendToRoom
→ services/room-service.ts:618-643 sendRoomMessage
→ POST /chat-rooms/:chatRoomId/messages
→ normalizeMessage
→ replace temporary UI row with server message
```

The backend response supplies the message ID. Temporary IDs are created only
for optimistic UI rows (`app/chat-room/[chatRoomId].tsx:662-703`) and are
replaced after the response. This is the correct authority boundary for the
normal text path.

### Message IDs

**Status: CONNECTED for server responses; temporary IDs exist only in optimistic
UI.**

`services/room-service.ts:383-425` maps the server `id`, and
`types/chat-message.ts:53-65` maps it to the chat library `_id`. Operations
target the message ID. The SQLite schema uses a composite room/message identity
after migration (`services/chat-cache.ts:75-103`).

One unused cache helper still queries by message ID without a room constraint;
see ISSUE-014.

## Message Operations

### Edit

**Status: PARTIALLY IMPLEMENTED.**

`app/chat-room/[chatRoomId].tsx:1166-1172` enters edit mode only for the
selected message. `handleSend` at lines 630-659 optimistically updates the
message, calls `editRoomMessage`, and updates SQLite only after the server
request resolves.

The service call is real:
`services/room-service.ts:739-746` sends
`PATCH /chat-rooms/:chatRoomId/messages/:messageId` with `{ body }`.

The sender's current UI and local cache are updated. A second device receives
the edit only if the backend includes the changed message in the `changes` or
messages response; the polling code does not merge updates for an existing
message. See ISSUE-007.

### Reactions

**Status: PARTIALLY IMPLEMENTED; visible reaction strip is not connected.**

The screen defines a real backend operation at
`app/chat-room/[chatRoomId].tsx:1188-1249`:

```text
reaction selection
→ optimistic localReactions update
→ toggleRoomReaction(roomId, messageId, emoji)
→ POST .../messages/:messageId/reactions
→ server reactions replace local state
→ updateCachedMessage
```

The chat library is configured with a reactions object at lines 1651-1655.
However:

- `components/chat/MsChatBubble.tsx:54-73` does not expose or attach a custom
  reaction callback.
- `components/chat/MsChatBubble.tsx:263-265` renders
  `MsReactionStrip` without `onPress`.
- `components/chat/MsReactionStrip.tsx:12-16,67-87` supports an `onPress`
  prop, but receives none from the bubble.

The quick reaction path may be invoked by the third-party Chat component, but
the custom rendered reaction pills are demonstrably non-interactive. Existing
reactions also update only when initial messages or the reaction request itself
returns; room polling does not reconcile them.

### Reply / quoted message

**Status: PARTIALLY IMPLEMENTED and connected for the normal text path.**

- Swipe reply is configured at `app/chat-room/[chatRoomId].tsx:1642-1649`.
- The long-press reply handler at lines 1181-1186 converts the selected
  message to a `ReplyMessage`.
- Text send captures the quoted ID at lines 690-710 and sends
  `replyToId`.
- `services/room-service.ts:638` serializes it as `reply_to_id`.
- `services/room-service.ts:444-454` normalizes the server quote.
- `types/chat-message.ts:81-93` maps it to `replyMessage`.
- `components/chat/MsChatBubble.tsx:245-258` renders the quote and invokes
  `onQuotePress` to scroll to the original ID.

This depends on the long-press entry path being reachable. A swipe reply is
more clearly connected than the custom long-press menu because the swipe path
is directly supplied to the Chat library.

### Message submenu

**Status: PRESENT but entry and several actions are not fully proven.**

The screen defines React, Edit, Copy, Message Info, and Delete actions at
`app/chat-room/[chatRoomId].tsx:1942-1986`. Delete has real server calls and
copy uses `expo-clipboard`. There is no Forward, Save, or Report message action
in this submenu.

The menu entry is passed as `onLongPressMessage={handleLongPress}` at lines
1657-1667, but `MsChatBubble` neither declares nor consumes that prop. No
`Pressable.onLongPress` or equivalent is attached in the custom bubble source.
See ISSUE-004.

### Delete for me

**Status: PARTIALLY IMPLEMENTED.**

`handleDelete(false)` at `app/chat-room/[chatRoomId].tsx:972-1022` sends
`DELETE .../messages/:messageId?scope=me`, then removes the local message row,
applies local Context Auth removals, deletes local media, and removes the
visible message.

The service method is real at `services/room-service.ts:719-733`. The expected
other-user preservation is delegated to the server. The client-side path does
not verify the other participant's context, and later polling does not
reconcile context removals. See ISSUE-007.

### Delete for everyone

**Status: PARTIALLY IMPLEMENTED.**

The option is shown only when `deleteTarget.user._id === currentUserId` at
`app/chat-room/[chatRoomId].tsx:1848-1861`. The request uses `scope=everyone`
through the same service call. The current device is updated after server
success.

Both-context deletion, authorization, and synchronization on the other device
are backend responsibilities but are not verified by the client. The polling
path does not process a removal-only change response.

## Delete / Clear

### Clear Chat

**Status: PARTIALLY IMPLEMENTED and locally unsafe on request failure.**

The intended chain exists:

```text
header menu
→ handleClearRoom
→ POST /chat-rooms/:chatRoomId/clear
→ clearCachedRoomContext(chatRoomId, userId)
→ clear SQLite messages/context membership
→ clear local room media
```

The relevant code is `app/chat-room/[chatRoomId].tsx:1124-1164` and
`services/room-service.ts:665-672`.

The `catch` at lines 1142-1145 intentionally ignores a failed server response
and continues deleting local state. That violates the server-authoritative
sequence: the client can show an empty context even when the server did not
clear it. See ISSUE-009.

### Delete / remove chat from list

**Status: PARTIALLY IMPLEMENTED.**

`handleDeleteRoom` at `app/chat-room/[chatRoomId].tsx:1086-1122` calls the real
room DELETE endpoint, removes the local room row, clears local context/messages,
removes local media, and navigates back. The room ID is not locally regenerated.

The handler also catches a failed backend request and proceeds with local
cleanup and navigation at lines 1099-1103. This can hide a failed server-side
remove operation. Reopening the same pair is delegated to the backend
`POST /chat-rooms` behavior and cannot be verified statically.

## Block / Unblock

**Status: BROKEN AGAINST THE REQUIRED ROOM-STATE ARCHITECTURE.**

`app/chat-room/[chatRoomId].tsx:1044-1084` calls real user endpoints:

- `services/users.ts:113-120`, `POST /users/:username/block`
- `services/users.ts:122-129`, `DELETE /users/:username/block`

But the room screen then stores `@ms_blocked_<username>` in AsyncStorage and
uses that local flag to disable the composer. Lines 565-581 hydrate the same
flag on mount. The code itself states that the room/backend payload does not
expose the block state.

The required architecture says blocking leaves the shared room alive but makes
the room inactive and prevents messaging. The client does not request a
room-level state, does not consume one, and continues the room poll interval
while blocked. A server-side block may reject sends, but the local state can
also be stale across devices.

## Chat List

**Status: CONNECTED for room metadata.**

`app/(tabs)/messages.tsx:311-341` loads the SQLite room cache and then fetches
`GET /chat-rooms?tab=all|archived`. Rows are keyed by `chatRoomId` at lines
486-490. `ChatRoomRow` uses the backend-resolved `otherUser`, latest message
metadata, timestamp, unread count, and room ID at lines 72-135.

The long-press list actions call real mark-read, archive, and delete room
services at lines 381-416. The archive/delete updates are optimistic and
restore local state on failure, though the restore path is not a full server
refetch.

## SQLite

**Status: PRESENT and broadly connected, but not consistently authoritative.**

`services/chat-cache.ts:17-109` opens `meetsweet_chat.db`, creates room,
message, auth, draft, and room-context tables, and performs additive schema
migrations. Native uses SQLite; web uses AsyncStorage.

Connected cache paths include:

- room list: `app/(tabs)/messages.tsx:315-333`
- initial messages: `app/chat-room/[chatRoomId].tsx:440-463`
- message ID/context ID storage: `services/chat-cache.ts:157-190`
- server context removals: `services/chat-cache.ts:464-525`
- edit/reaction patches: `services/chat-cache.ts:320-357`
- local media URI: `services/chat-cache.ts:282-317`
- room clear/delete cleanup: `services/chat-cache.ts:262-280,527-565`

Problems:

- Older paginated messages are prepended in memory but are not cached by
  `loadMessages` when `before` is supplied (`app/chat-room/[chatRoomId].tsx:
  445-469`).
- A failed clear still deletes local state.
- Polling updates the UI/cache only for newly returned messages and does not
  synchronize existing message changes.
- `getCachedMessages` limits SQLite reads to 200 rows
  (`services/chat-cache.ts:192-200`), which can make a local room appear
  incomplete even when more server history exists.

## Media / Expo File System

**Status: PARTIALLY VERIFIED on native; web intentionally falls back to remote
URLs.**

`services/chat-media.ts:1-35` lazy-loads `expo-file-system/legacy` and returns
null on web. Native media is organized as:

```text
<documentDirectory>/chat-media/<chatRoomId>/<messageId>.<extension>
```

Outbound persistence uses `persistLocalMedia` at lines 125-160. Inbound or
freshly fetched media uses `downloadRoomMedia` at lines 162-194. Existing
files are probed before downloading, and the room screen verifies stale
`localUri` values at `app/chat-room/[chatRoomId].tsx:305-383`.

The file lifecycle is therefore real for native images, videos, audio, and
documents. Web does not store local files because the service explicitly
falls back to remote URLs.

## Sender / Receiver Media Behavior

**Status: PARTIALLY IMPLEMENTED.**

Sender paths upload first and then persist the original picker/recorder URI
using the authoritative returned message ID:

- voice/audio: `app/chat-room/[chatRoomId].tsx:743-772,820-867`
- image/video/document: lines 900-948

Receiver or freshly fetched messages are passed to `ensureMediaLocal`, which
resolves an existing local file or downloads it and records `localUri`.

The sender-local behavior is correct on native when persistence succeeds.
However, `downloadRoomMedia` is called for every fetched media message during
initial room loading, not strictly on a receiver's first render or only when a
file is opened. This is an implementation choice with higher bandwidth cost.
Failed downloads retain a remote fallback and set `msMediaStatus: 'failed'`.

## Message Type vs File Type

**Status: PRESENT in types and render routing; persistence is incomplete.**

`services/room-service.ts:104-155` distinguishes:

- `mediaType`: message behavior/category
- `fileType`: stored format
- `isVoiceNote`: voice message vs uploaded audio file

`types/chat-message.ts:9-50,95-117` carries the distinction to the renderer.
`components/chat/MsChatBubble.tsx:95-193` routes voice notes to
`MsVoiceBubble`, audio files/documents to `MsFileCard`, and image/video to
`MsMediaCard`.

The declared `SendRoomMessagePayload` includes `fileType` and `isVoiceNote`, but
`services/room-service.ts:624-640` omits both fields from the actual JSON
request. This makes the declared contract stronger than the real wire
behavior. See ISSUE-011.

## Rendering

**Status: PRESENT and mostly connected.**

- Images use `MsMediaCard`, with local-first URI selection and retry state:
  `components/chat/MsMediaCard.tsx:88-205`.
- Videos use a poster/play card and the room screen opens `MsVideoPlayer`:
  `app/chat-room/[chatRoomId].tsx:1328-1344,2000-2032`.
- Voice notes use `MsVoiceBubble` through `MsChatBubble:162-171`.
- Audio file/document attachments use `MsFileCard` and `handleOpenFile`:
  `app/chat-room/[chatRoomId].tsx:1252-1326`.
- Full-screen images support zoom/swipe/share in
  `app/chat-room/[chatRoomId].tsx:2037` onward.

`MsVoiceNoteBubble.tsx` is a separate voice renderer but is not used by the
current `MsChatBubble`; the active voice renderer is `MsVoiceBubble`. See
ISSUE-015.

## Polling

### Chat list polling

**Status: CONNECTED and scoped.**

`app/(tabs)/messages.tsx:351-371` polls only room metadata every 15 seconds,
merges by `chatRoomId`, sorts by latest activity, and clears its interval on
unmount/tab change. It does not fetch all room messages.

### Open room polling

**Status: CONNECTED for new-message detection; incomplete for synchronization.**

`app/chat-room/[chatRoomId].tsx:482-525` starts one interval every 10 seconds
for the current room and pauses it when the app is backgrounded. It calls
`checkRoomChanges` with the latest message ID and adds only messages whose IDs
are not already rendered.

It does not:

- apply Context Auth removals;
- remove a message deleted for me/everyone;
- replace an existing message after an edit;
- replace reaction state changed by the other user;
- update cached rows for edits/deletes/reactions;
- process a `changed: true` result with no `messages` array.

Therefore it is not a complete room synchronization loop.

## Loading States

**Status: PARTIALLY CONNECTED.**

The room list shows skeleton rows while loading. New-room creation uses
`MsRoomCreationLoader` at `app/(tabs)/messages.tsx:292-294`, covering the
recipient access check and `getOrCreateChatRoom` request.

The room screen uses an activity indicator while initial message loading and
shows media download states in file cards. Loading a pre-existing room is not
shown as a room-creation flow; it loads messages and room metadata separately.

The room loader does not expose a distinct context-auth synchronization state.
Because `/context` failures are swallowed, a user cannot distinguish a room
opened with verified context membership from one opened without it.

## Navigation

**Status: MOSTLY VERIFIED.**

Message entry points pass participant IDs to the backend and navigate with the
returned room ID. The room screen receives only `chatRoomId` and resolves the
other user from room data.

The header profile opens the room-resolved `otherUser`. The full-profile CTA
uses `/creator/${username}` in `components/MsUserProfileSheet.tsx:64-67`,
which is not a generic user route and can be wrong for non-creator
participants. The room screen also imports `getUser` but never uses it.

## Legacy Code

No active `/api/conversations` or conversation service call was found in the
inspected messaging implementation. The only remaining uses of the word
“conversation” found in the reviewed paths are UI copy such as “Start your
first conversation” and a comment-room documentation statement.

The room service explicitly uses:

```text
USER → ROOM → CONTENT
```

and sends all message operations under `/chat-rooms/:chatRoomId`.

## Dead / Dummy / Placeholder Code

The following source evidence indicates dead, disconnected, or misleading
implementation:

- `app/chat-room/[chatRoomId].tsx:109` imports `getUser` but never calls it.
- `app/chat-room/[chatRoomId].tsx:114` imports `deleteCachedMessage` but never
  calls it.
- `app/chat-room/[chatRoomId].tsx:89` imports `MsMediaLoader` but the room
  screen does not render it.
- `app/chat-room/[chatRoomId].tsx:1813-1821` renders a `Modal` with
  `visible={showProfileSheet === false && false}`, which is permanently
  invisible and contains no behavior.
- `components/chat/MsVoiceNoteBubble.tsx` exports a renderer that is not used
  by the active bubble router.
- `components/chat/MsReactionStrip.tsx` accepts a functional callback, but the
  active bubble never supplies one.
- `services/chat-cache.ts:210-232`, `deleteCachedMessage`, marks a row as
  deleted but is not part of the delete execution path; the actual room handler
  uses `removeCachedMessage`.

## Critical Problems

### ISSUE-001 — Context authorization can be bypassed by a failed context request

Severity:
CRITICAL

Status:
ARCHITECTURALLY WRONG

File:
`services/room-service.ts`

Lines:
538-555

Function/Component:
`getRoomContext`

Finding:

The service catches every exception from `GET /chat-rooms/:chatRoomId/context`
and returns `null`. The room screen treats `null` as “no context sync” and
continues with the normal messages response.

Expected:

The server-controlled Context ID and Context Auth should determine which
message IDs belong to the current user's context before those messages are
rendered. Only a deliberately supported “endpoint not yet deployed” migration
case should be treated as a compatibility fallback; authentication, network,
permission, malformed-response, and server errors should not silently disable
the membership check.

Why it is a problem:

A transient error or authorization failure can cause the client to display
messages without verifying the user's Context Auth membership. This undermines
delete-for-me and clear semantics and makes the Context Auth architecture
optional in practice.

Evidence:

`getRoomContext` has a catch-all at lines 550-555. The caller at
`app/chat-room/[chatRoomId].tsx:404-409` returns an empty removal list when the
result is null, and `loadMessages` at lines 448-453 then renders the ordinary
message result.

Recommended fix:

Distinguish an explicitly supported unavailable-endpoint response from all
other failures, and define a fail-closed or clearly surfaced behavior for
context authorization failures. Do not implement the fix in this audit.

### ISSUE-002 — Context synchronization is absent from incremental polling

Severity:
CRITICAL

Status:
PARTIALLY IMPLEMENTED

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
482-525

Function/Component:
`pollRoom`

Finding:

The open-room poll calls `/changes`, and if it receives messages, it maps and
appends only IDs not currently present. It never calls `getRoomContext`,
`syncRoomContext`, or `applyContextAuthRemovals`.

Expected:

Polling should update the current user's local replica from server state,
including Context Auth removals and clear/delete-for-me/delete-for-everyone
changes.

Why it is a problem:

A user can delete a message for themselves on one device while another open
device continues to display it indefinitely. If a server change response
contains only removals or updates, the client returns without reconciling.

Evidence:

`pollRoom` lines 488-505 handles `changes.messages` only. The early return at
lines 493-496 exits when no message array is provided. The context sync path is
used only during initial/non-paginated `loadMessages` at lines 448-450.

Recommended fix:

Define and implement an incremental synchronization sequence that reconciles
context membership and changed message records before updating the UI/cache.
Do not implement the fix in this audit.

### ISSUE-003 — Room blocking is client-local instead of room-authoritative

Severity:
HIGH

Status:
ARCHITECTURALLY WRONG

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
565-581, 1044-1084

Function/Component:
block status hydration and `handleBlockUser`

Finding:

The client calls user block endpoints but persists the effective room block
state only in AsyncStorage keyed by username. `handleSend` rejects sends
based on this local flag, and the input is disabled from it.

Expected:

Blocking should leave the permanent Chat Room intact while making the shared
room inactive/blocked through backend state. Both clients should observe that
state, and sends should be prevented by the backend as well as the UI.

Why it is a problem:

The local flag is not shared between devices and can become stale. The poller
continues running and incoming messages are not filtered by the block state.
The UI can claim the room is blocked even when the backend has not accepted
the operation, or fail to show a block performed elsewhere.

Evidence:

Lines 575-576 read `@ms_blocked_<username>`. Lines 1063-1065 call only
`/users/:username/block`. There is no room-state request or server room-state
field used to set `isBlocked`.

Recommended fix:

Use a server-authoritative room/user relationship state, synchronize it on room
open and polling, and gate both UI and server operations from that state. Do
not implement the fix in this audit.

### ISSUE-004 — Custom message bubble does not provide a proven long-press entry path

Severity:
HIGH

Status:
BROKEN

File:
`components/chat/MsChatBubble.tsx`

Lines:
54-73, 245-265

Function/Component:
`MsChatBubble`

Finding:

The screen passes `onLongPressMessage={handleLongPress}` to `MsChatBubble` at
`app/chat-room/[chatRoomId].tsx:1657-1667`, but `MsChatBubbleProps` does not
declare this property, the component does not destructure it, and no long-press
handler is attached to the custom bubble's `Pressable` elements.

Expected:

Long-pressing any message should open the real submenu so reactions, reply,
edit, copy, info, and delete can be reached.

Why it is a problem:

The submenu can exist in source while being unreachable through the rendered
custom bubble. The behavior cannot be credited as functional merely because
`handleLongPress` and menu JSX exist.

Evidence:

The only `Pressable` in the bubble is the quoted-preview press at lines 246-258.
The media card and text bubble receive no long-press callback from this
component. The passed prop is not consumed.

Recommended fix:

Connect the actual rendered message surface to the long-press handler and use a
single typed callback contract between the screen, Chat library, and custom
bubble. Do not implement the fix in this audit.

### ISSUE-005 — Rendered reaction pills are inert

Severity:
HIGH

Status:
BROKEN

File:
`components/chat/MsChatBubble.tsx`

Lines:
263-265

Function/Component:
`MsChatBubble`

Finding:

`MsReactionStrip` is rendered with only `reactions` and `position`. Its
functional `onPress` prop is omitted.

Expected:

Tapping an existing reaction pill should toggle the current user's reaction
through the same server-authoritative reaction path.

Why it is a problem:

The strip visually suggests an interactive reaction state but its own
`ReactionPill` calls `onPress?.(emoji)` with no callback supplied. The visible
reaction state cannot be toggled from the pill.

Evidence:

`components/chat/MsReactionStrip.tsx:12-16` declares `onPress`, and lines
80-87 pass it to each pill. `MsChatBubble.tsx:263-265` does not pass it.

Recommended fix:

Pass a message-aware reaction callback into the strip and ensure its server
response/cache update path is shared with quick reactions. Do not implement the
fix in this audit.

### ISSUE-006 — Reaction callback wiring depends on an unverified library path

Severity:
HIGH

Status:
SUSPICIOUS

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
1651-1655

Function/Component:
Chat `reactions` configuration

Finding:

The screen supplies `onReactionPress: handleReaction` to the third-party Chat
component, but the custom bubble is rendered separately and does not expose a
reaction callback. The local `MsReactionStrip` path is therefore disconnected,
while the library path cannot be established from the project source alone.

Expected:

There should be one demonstrable, typed path from long press or reaction tap to
`handleReaction`, and the custom renderer should preserve it.

Why it is a problem:

A UI library configuration can look complete while a custom renderer prevents
the event from reaching it. This is exactly the kind of “present but not
connected” behavior this audit is intended to detect.

Evidence:

`handleReaction` is only directly referenced in the Chat config and the custom
menu JSX. `MsReactionStrip` is not connected to it.

Recommended fix:

Verify the installed Chat library event contract and explicitly wire the
custom-rendered interaction surface. Do not implement the fix in this audit.

### ISSUE-007 — Polling does not reconcile edits, deletes, or reactions

Severity:
HIGH

Status:
PARTIALLY IMPLEMENTED

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
488-505

Function/Component:
`pollRoom`

Finding:

Incoming polling messages are filtered only by whether their ID already
exists. Existing IDs are never replaced.

Expected:

The open room should reflect server-confirmed edits, deletion state, reaction
state, media changes, and removal of messages from either Context Auth tree.

Why it is a problem:

An edit or reaction returned by the backend for an existing message is dropped
because `newOnes` excludes it. A delete or remove-only change is ignored.
SQLite is also not updated for these changes.

Evidence:

Lines 497-501 create `newOnes` from IDs not in the current UI and return
`[...newOnes, ...prev]`. There is no existing-ID replacement or removal merge.

Recommended fix:

Treat polling as a server reconciliation operation: merge authoritative
message records by ID, process removals, synchronize SQLite, and update the
context membership. Do not implement the fix in this audit.

### ISSUE-008 — Older paginated messages are not written to the cache

Severity:
MEDIUM

Status:
PARTIALLY IMPLEMENTED

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
445-469

Function/Component:
`loadMessages`

Finding:

When `before` is supplied, the code prepends older messages to the visible
Chat list but calls `cacheMessages` only in the non-`before` branch.

Expected:

Every server-confirmed page should synchronize SQLite so reopening the room
does not discard history that the user already loaded.

Why it is a problem:

The user can scroll back, close the room, and lose that locally cached history.
The next open reads a truncated/stale local replica before the server request
completes.

Evidence:

`if (before)` at lines 454-456 calls `Chat.prepend`; the only
`cacheMessages` call is lines 461-462 in the `else` branch.

Recommended fix:

Cache older pages after server confirmation using the same room/message keys.
Do not implement the fix in this audit.

### ISSUE-009 — Clear Chat deletes local state after a failed server request

Severity:
HIGH

Status:
ARCHITECTURALLY WRONG

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
1124-1164

Function/Component:
`handleClearRoom`

Finding:

The handler clears visible messages immediately, catches a failed
`clearChatRoom` request, and then clears the local Context Auth/message cache
and local media regardless.

Expected:

The server should confirm the current user's room-context clear before the
client commits the local representation as cleared.

Why it is a problem:

The local device can diverge from the server and incorrectly appear cleared.
The next poll may not repair the state because the poller does not synchronize
Context Auth or process a removal-only change.

Evidence:

Lines 1137-1139 clear UI state before the request. Lines 1142-1145 swallow the
request failure. Lines 1151-1158 then clear local context and media anyway.

Recommended fix:

Use a pending state and commit local deletion only after server success, or
surface a failed clear and rehydrate authoritative state. Do not implement the
fix in this audit.

### ISSUE-010 — Delete-chat proceeds as if successful after backend failure

Severity:
MEDIUM

Status:
SUSPICIOUS

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
1086-1122

Function/Component:
`handleDeleteRoom`

Finding:

The handler catches any `deleteChatRoom` failure, continues to remove the room
and local context/media, and navigates back.

Expected:

The local list should be changed only after the server confirms that this
user's room-list visibility was removed, or the failure should be visible and
the server state re-fetched.

Why it is a problem:

A network failure can make the room disappear locally while it remains in the
server chat list. The user may see it return later and cannot tell whether the
operation succeeded.

Evidence:

The empty catch at lines 1100-1103 is followed unconditionally by local
cleanup at lines 1109-1115 and `router.back()` at line 1117.

Recommended fix:

Distinguish an already-removed response from an unknown failure and reconcile
the room list after the operation. Do not implement the fix in this audit.

### ISSUE-011 — Voice/file Auth Tree metadata is declared but omitted on the wire

Severity:
HIGH

Status:
PARTIALLY IMPLEMENTED

File:
`services/room-service.ts`

Lines:
213-229, 618-643

Function/Component:
`SendRoomMessagePayload`, `sendRoomMessage`

Finding:

The payload type declares `fileType` and `isVoiceNote`, and the screen passes
those fields in its `sendToRoom` options. The actual JSON body serializes only
body, media URL/type, caption, file name/size, MIME type, duration, and
`reply_to_id`.

Expected:

The message request should preserve the message-type/file-type distinction
required by the renderer and Context Auth metadata, or the server must
guarantee equivalent fields in every response and later fetch.

Why it is a problem:

The optimistic sender UI is explicitly patched with voice/file metadata, but
the metadata is not sent to the backend. After a reload, normalization must
guess from the response. An audio URL without a recognized extension and a
null `media_type` can become a message with no audio renderer.

Evidence:

`app/chat-room/[chatRoomId].tsx:831-834` passes `isVoiceNote` and `fileType`;
`room-service.ts:629-639` does not serialize either field. The reload path uses
`normalizeMessage` at lines 383-425 and only infers audio from an explicit
type or URL extension.

Recommended fix:

Align the wire contract and response normalization so voice/audio-file
metadata survives reload and cross-device synchronization. Do not implement the
fix in this audit.

### ISSUE-012 — Media downloads are eager for every fetched message

Severity:
MEDIUM

Status:
PARTIALLY IMPLEMENTED

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
305-383, 471-472

Function/Component:
`ensureMediaLocal`

Finding:

Every initial server-fetched media message with a remote URL is resolved or
downloaded immediately after the message page loads, including documents and
audio files that could otherwise be opened on demand.

Expected:

The sender should retain its local original, while the receiver should obtain
and cache remote media with a deliberate lifecycle. Non-previewable files can
be downloaded when requested.

Why it is a problem:

Opening a room can trigger multiple downloads and consume storage/bandwidth
before the user views any attachment. It also makes a large message history
more expensive than the lightweight room/message request suggests.

Evidence:

`loadMessages` always calls `ensureMediaLocal(result.messages)` at lines
471-472. `ensureMediaLocal` calls `downloadRoomMedia` for each eligible message
at lines 340-357.

Recommended fix:

Define eager vs on-demand policy per media category and preserve local sender
files without redownloading them. Do not implement the fix in this audit.

### ISSUE-013 — Profile CTA assumes every room participant is a creator

Severity:
MEDIUM

Status:
SUSPICIOUS

File:
`components/MsUserProfileSheet.tsx`

Lines:
64-67

Function/Component:
`handleViewProfile`

Finding:

The room correctly resolves the participant by ID, but the profile sheet
always routes to `/creator/${user.username}`. The room screen discards
`isCreator` while hydrating `otherUser` at lines 540-546.

Expected:

The profile interaction should open the correct profile for the resolved room
participant, not assume a creator route based only on a username.

Why it is a problem:

A non-creator participant can be sent to an invalid or semantically incorrect
route. The identity source is correct, but the destination type is not
validated.

Evidence:

`RoomParticipant` includes `isCreator` at `services/room-service.ts:66-73`,
but `ProfileSheetUser` is populated without it and the CTA unconditionally
uses `/creator/:username`.

Recommended fix:

Preserve the participant role and route to the correct profile surface, or
resolve the destination from the user ID. Do not implement the fix in this
audit.

### ISSUE-014 — Unused cache delete helper has room-collision risk

Severity:
MEDIUM

Status:
DEAD CODE

File:
`services/chat-cache.ts`

Lines:
210-232

Function/Component:
`deleteCachedMessage`

Finding:

The helper selects and updates a SQLite message by `id` alone. The current
schema is room-scoped and can contain the same message ID only if the backend
violates uniqueness, but the correct local operation contract still requires
`chatRoomId + messageId`. The helper is not called by the actual delete path.

Expected:

All message cache operations should target a specific room and message ID, and
dead alternatives should not imply a valid deletion path.

Why it is a problem:

It is inconsistent with `removeCachedMessage(chatRoomId, messageId)` and with
the composite room/message schema. If reused later, it could mutate an
ambiguous row and mark rather than remove it.

Evidence:

Lines 215-224 query and update `WHERE id = ?`; the handler imports the helper
at `app/chat-room/[chatRoomId].tsx:114` but never calls it.

Recommended fix:

Remove or replace the unused helper with a room-scoped operation and ensure
all callers use the same deletion semantics. Do not implement the fix in this
audit.

### ISSUE-015 — Duplicate voice renderer is unused

Severity:
LOW

Status:
DEAD CODE

File:
`components/chat/MsVoiceNoteBubble.tsx`

Lines:
1-205

Function/Component:
`MsVoiceNoteBubble`

Finding:

The project contains a full voice-note renderer, but the active router imports
and renders `MsVoiceBubble` instead:
`components/chat/MsChatBubble.tsx:32,162-171`.

Expected:

There should be one authoritative voice renderer or a documented reason for
the separate component.

Why it is a problem:

Future fixes to `MsVoiceNoteBubble` will not affect actual room rendering.
The unused component also makes it difficult to determine which download,
share, and playback behavior is shipped.

Evidence:

Search of the inspected application source found no call site for
`MsVoiceNoteBubble`; `MsChatBubble` uses `MsVoiceBubble`.

Recommended fix:

Choose one active renderer and remove or explicitly isolate the other. Do not
implement the fix in this audit.

### ISSUE-016 — Permanently invisible empty modal and unused imports obscure the active path

Severity:
LOW

Status:
DEAD CODE

File:
`app/chat-room/[chatRoomId].tsx`

Lines:
89, 109, 114, 1813-1821

Function/Component:
room screen imports and placeholder modal

Finding:

The room screen imports `MsMediaLoader`, `getUser`, and
`deleteCachedMessage` without using them. It also renders a modal whose
visibility expression is always false:
`showProfileSheet === false && false`.

Expected:

Only connected behavior should remain in the room execution path.

Why it is a problem:

The dead modal and imports make the code appear to have room actions or media
behavior that do not execute. They increase the chance that a future change is
made to a non-shipping path.

Evidence:

The import lines and the unconditional false visibility expression are in the
specified range. No call sites were found for the imported functions in the
room screen.

Recommended fix:

Remove dead paths or connect them deliberately after deciding their purpose.
Do not implement the fix in this audit.

## Logical Problems

1. **Failure semantics are inconsistent.** Edit and delete-for-message revert
   their optimistic UI when the server fails, while Clear Chat and Delete Chat
   continue local cleanup after a failed server request.
2. **Room polling is additive, not reconciliatory.** It handles new IDs but not
   changed records or removals.
3. **The block banner is local truth.** It can disagree with another device or
   the server.
4. **Audio metadata can be correct only in the optimistic session.** The
   actual message request drops fields needed to reconstruct it.
5. **Paginated history is not cached.** The visible list and local replica can
   diverge after loading older pages.
6. **The custom reaction strip is read-only despite its interactive visual
   affordance.**

## Architectural Problems

1. Context Auth is modeled as server-controlled data but made optional by
   catch-all error handling.
2. The incremental polling path does not synchronize the per-user context.
3. Blocking is implemented as a user endpoint plus a client-local room gate,
   not as a synchronized room inactive state.
4. The client can commit local clear/delete state without server confirmation.
5. Wire-level message metadata does not match the richer client type contract.
6. The custom bubble overrides the Chat library's visual surface without
   proving that the library's long-press event still reaches the custom menu.
7. Profile navigation assumes creator identity after correctly resolving a
   generic room participant.
8. Native local media storage is real, but web's remote-only fallback means
   the same feature has materially different offline behavior by platform.

## Missing Features

The following were not found as connected functionality in the reviewed
messaging path:

- server-synchronized room block/inactive state;
- complete incremental synchronization of Context Auth removals;
- poll-time reconciliation for edit, delete, reaction, and media updates;
- functional taps on rendered reaction pills;
- a proven custom-bubble long-press entry path;
- persistent caching of older paginated message pages;
- a generic profile destination for non-creator participants;
- message Forward, Save, and Report actions;
- server-preserved `fileType` / `isVoiceNote` request metadata;
- runtime proof of backend pair deduplication and two-context behavior.

## Suspicious Implementations

- `getRoomContext` claims to degrade only for an unshipped endpoint but catches
  every error.
- `handleClearRoom` comments describe server authority while the code commits
  local deletion after a failed request.
- `handleDeleteRoom` comments describe a per-user room-list removal but the
  failure path is treated as success.
- `MsReactionStrip` is designed as interactive, but its active caller does not
  provide a callback.
- `sendRoomMessage` types contain fields that are silently omitted from the
  request body.
- The active room screen has a permanently false modal and multiple unused
  messaging imports.

## Recommended Fix Order

Do not fix these items as part of this audit. The safest implementation order
would be:

1. **Make Context Auth failure behavior explicit and fail-safe.** Establish
   whether `/context` is mandatory now or whether a narrowly defined migration
   fallback is still required.
2. **Build one authoritative room reconciliation routine.** It should process
   context membership, added messages, updated messages, removed messages,
   edits, deletions, reactions, and SQLite writes. Use it for initial load,
   pagination, and polling.
3. **Repair the message interaction entry path.** Prove long press reaches the
   menu and connect rendered reaction pills to the server reaction operation.
4. **Align the message wire contract.** Preserve voice/file metadata across
   server response, SQLite, reload, and a second device.
5. **Make clear/delete operations server-confirmed.** Do not erase local
   authoritative-looking state after unknown failures.
6. **Move block state to the room/user backend contract.** Keep the room ID
   permanent while synchronizing inactive state across clients.
7. **Fix profile destination and remove dead code.** Preserve participant role
   information and eliminate misleading unused handlers/components.
8. **Add two-account integration coverage.** Test each context independently
   for send, edit, delete-for-me, delete-for-everyone, clear, block,
   unblock, polling, and media.

## Audit Totals

The totals below count distinct user-visible or architectural features. Issue
categories overlap by design; for example, one feature can be both partially
implemented and architecturally wrong.

```text
TOTAL FEATURES AUDITED:       27
ACTUALLY VERIFIED:             8
PARTIALLY IMPLEMENTED:        11
NOT IMPLEMENTED:               3
BROKEN:                         4
DEAD/DUMMY CODE:               4
ARCHITECTURAL VIOLATIONS:      8
CRITICAL ISSUES:               2
```

### Features actually verified

1. Backend-returned Chat Room ID entry path
2. Room-scoped message POST for ordinary text
3. Server message ID mapping into UI message ID
4. Room-based chat list loading
5. Native SQLite/AsyncStorage cache initialization
6. Native local media persistence primitives
7. Initial room polling interval scoped to one room
8. Server-backed edit/delete/reaction service methods exist and are called on
   their reachable paths where the corresponding UI event is available

“Actually verified” here means the source contains a connected path with no
obvious local break in the inspected sequence. It does not mean the live
backend or cross-device behavior was runtime-tested.

## Final Verdict

# MOBILE SYSTEM REQUIRES FIXES

The project has a genuine room-based messaging foundation and should not be
rewritten as a legacy conversation system. It is not ready to claim verified
dual-context behavior, reliable synchronization, or complete message
interaction behavior. Backend integration can proceed only alongside the
Context Auth, reconciliation, block-state, metadata, and interaction fixes
listed above.

---

# MeetSweet Mobile — Settings & Creator Dashboard Audit Report

## Audit Scope & Overview

This section contains a comprehensive code and logic audit of the **Settings** and **Creator Dashboard** modules (including sub-pages, routes, API integrations, and handlers) in the MeetSweet mobile application repository.

Files Audited:
- `app/settings.tsx`
- `app/creator-dashboard.tsx`
- `app/creator-payout.tsx`
- `app/notification-settings.tsx`
- `app/privacy-settings.tsx`
- `app/security-settings.tsx`
- `app/edit-profile.tsx`
- `services/api.ts`
- `services/users.ts`
- `services/wallet.ts`
- `services/content.ts`
- `services/albums.ts`

---

## Findings by Category

### 1. Critical Issues

- **CRIT-001: Missing Service Module `@/services/settings`**
  - **Location**: `app/settings.tsx:55-66`
  - **Detail**: `app/settings.tsx` imports 9 functions (`getPrivacySettings`, `getNotificationSettings`, `getSettings`, `updatePrivacySettings`, `updateNotificationSettings`, `updateSettings`, `deleteAccount`, `logoutAllDevices`, `updatePassword`) from `@/services/settings`. However, the file `services/settings.ts` **does not exist** anywhere in the mobile codebase (`/MeetSweet-mobile/services/`). Invoking any setting action relying on this service layer causes runtime module resolution errors.

- **CRIT-002: Missing Service Module `@/services/creator`**
  - **Location**: `app/creator-dashboard.tsx:38-44`
  - **Detail**: `app/creator-dashboard.tsx` imports `getCreatorDashboard`, `getCreatorSettings`, `updateCreatorSettings`, and `getCreatorSubscribers` from `@/services/creator`. The file `services/creator.ts` **does not exist** in `MeetSweet-mobile/services/`. Attempting to render the Creator Dashboard causes module import failure at runtime.

- **CRIT-003: Missing Functions in `@/services/users`**
  - **Location**: `app/settings.tsx:67`, `app/(tabs)/profile.tsx:46`
  - **Detail**: `app/settings.tsx` and `app/(tabs)/profile.tsx` import `checkUsernameAvailability` and `updateMe` from `@/services/users`. However, neither function exists in `services/users.ts`. (`checkUsernameAvailability` is only defined locally inside `app/create-account.tsx`, and `updateMe` is missing from the service layer).

- **CRIT-004: Missing Wallet/Payout Functions in `@/services/wallet`**
  - **Location**: `app/creator-payout.tsx:50-58`
  - **Detail**: `app/creator-payout.tsx` imports `NIGERIAN_BANKS`, `getCreatorBalance`, `saveBankDetails`, `requestWithdrawal`, and `getWithdrawalHistory` from `@/services/wallet`. None of these exports exist in the wallet service layer.

---

### 2. Backend Connection Issues

- **CONN-001: Silent Local State Updates without Backend Persistence in Creator Settings**
  - **Location**: `app/creator-dashboard.tsx:481, 578, 592`
  - **Detail**: In `app/creator-dashboard.tsx`:
    - "Enable subscriptions" toggle updates local React state `setSubsEnabled`, but does not call `updateCreatorSettings`.
    - "Who can comment" updates local React state `setWhoCanComment`, but does not call `updateCreatorSettings`.
    - "Who can see my posts" updates local React state `setWhoCanSee`, but does not call `updateCreatorSettings`.
    - Result: Changes made by the creator appear successful in the UI but are lost immediately on screen refresh.

- **CONN-002: AsyncStorage Fallbacks Disconnected from Server API**
  - **Location**: `app/notification-settings.tsx:75-81`, `app/privacy-settings.tsx:129-130`
  - **Detail**: `app/notification-settings.tsx` and `app/privacy-settings.tsx` persist settings changes strictly to local `AsyncStorage` (`@ms_notif_prefs`, `@ms_privacy_prefs`). Both files contain explicit code comments noting that backend endpoints (`PATCH /users/me`) are not called or connected.

---

### 3. Dead Routes & Orphaned Screens

- **DEAD-001: Orphaned Settings Sub-Screen Routes**
  - **Location**: `app/notification-settings.tsx`, `app/privacy-settings.tsx`, `app/security-settings.tsx`, `app/edit-profile.tsx`
  - **Detail**: These 4 screen files exist in `app/` and are registered in `app/_layout.tsx`. However, `app/settings.tsx` was refactored to handle all sub-settings directly via bottom sheet modals inline inside `app/settings.tsx`. No link or button in the entire application navigates to `/notification-settings`, `/privacy-settings`, `/security-settings`, or `/edit-profile`. They are orphaned routes containing outdated/duplicate logic.

---

### 4. Illogical Code & Arbitrary Multipliers

- **ILLOG-001: Arbitrary Revenue Multiplier (1600x)**
  - **Location**: `app/creator-dashboard.tsx:103, 332, 638, 660`
  - **Detail**: In `app/creator-dashboard.tsx`, revenue returned by the backend service is hardcoded to be multiplied by `1600` (`revenue * 1600`) to display in NGN. This arbitrary hardcoded currency rate assumption introduces client-side calculation errors if the backend ever returns figures in NGN directly or if exchange rates change.

- **ILLOG-002: Local Username Cooldown Calculation Inconsistency**
  - **Location**: `app/edit-profile.tsx:25-33, 48-50`
  - **Detail**: `app/edit-profile.tsx` calculates a local 30-day username change cooldown based on `@ms_last_name_change` in `AsyncStorage`. Because the server holds authoritative profile update limits, tracking cooldowns purely on client-side storage can be bypassed by clearing app data or switching devices.

---

### 5. Mock Implementations

- **MOCK-001: Pure Mock Popups in Creator Dashboard ("Social Causes" & "Broadcast")**
  - **Location**: `app/creator-dashboard.tsx:603-619, 681-697`
  - **Detail**: All rows under "Social Causes" ("Link a cause or charity", "Display cause on profile", "Share cause updates") and "Broadcast" ("Send to all subscribers", "Send to Subscriber+ only", "Schedule broadcast") execute hardcoded static `Alert.alert(...)` dialogs. No service functions, handlers, or backend requests exist for these options.

- **MOCK-002: Mock Account Security & Linked Accounts Toasts**
  - **Location**: `app/settings.tsx:709`
  - **Detail**: Clicking "Linked Accounts" inside `app/settings.tsx` presents a toast message stating "Backend integration required for linked accounts".

---

### 6. State & Persistence Problems

- **PERSIST-001: Inconsistent Single-Source-of-Truth between Settings Modal & Standalone Screens**
  - **Location**: `app/settings.tsx` vs `app/privacy-settings.tsx`
  - **Detail**: `app/settings.tsx` attempts to synchronize state with server APIs, whereas `app/privacy-settings.tsx` and `app/notification-settings.tsx` read and write to separate local `AsyncStorage` keys (`@ms_privacy_prefs`, `@ms_notif_prefs`). If a user opens either standalone screen, changes will not sync with the main `app/settings.tsx` state or backend API.

---

### 7. Navigation Problems

- **NAV-001: Settings Hierarchy Inconsistency**
  - **Location**: `app/settings.tsx` vs `app/_layout.tsx`
  - **Detail**: `_layout.tsx` defines stack screen options for `privacy-settings`, `security-settings`, `notification-settings`, and `edit-profile` with `slide_from_right` transitions. However, `app/settings.tsx` opens them as bottom sheets (`BottomSheet` component), creating conflicting user experience paradigms and leaving stack routes unused.

---

### 8. API Contract Problems

- **CONTRACT-001: Disconnect between Front-end Service Expectations and API Definitions**
  - **Detail**: The UI layer in `app/settings.tsx`, `app/creator-dashboard.tsx`, and `app/creator-payout.tsx` calls functions expecting a rich REST API response, but the corresponding client service files (`services/settings.ts`, `services/creator.ts`, `services/wallet.ts`) were never created in the mobile project root.

---

### 9. Recommended Fixes

1. **Create Missing Mobile Service Files**:
   - Implement `services/settings.ts` with real `apiFetch` / `authFetch` calls targeting `/settings`, `/users/me/privacy`, `/users/me/notifications`, `/auth/change-password`, `/auth/logout-all`, and `/users/me` delete.
   - Implement `services/creator.ts` in `MeetSweet-mobile/services/` with `getCreatorDashboard`, `getCreatorSettings`, `updateCreatorSettings`, and `getCreatorSubscribers`.
   - Add `updateMe` and `checkUsernameAvailability` to `services/users.ts`.
   - Implement `services/wallet.ts` in `MeetSweet-mobile/services/` with `getCreatorBalance`, `saveBankDetails`, `requestWithdrawal`, `getWithdrawalHistory`, and `NIGERIAN_BANKS`.

2. **Connect All Creator Dashboard Settings to Backend**:
   - Wire `setWhoCanComment`, `setWhoCanSee`, and `setSubsEnabled` to call `updateCreatorSettings(...)` on change.
   - Connect or properly define backend handlers for Social Causes & Broadcast sections.

3. **Clean Up Orphaned Routes**:
   - Either remove `app/notification-settings.tsx`, `app/privacy-settings.tsx`, `app/security-settings.tsx`, and `app/edit-profile.tsx` or redirect them to use centralized service methods if navigated to directly.

4. **Standardize Currency Handling**:
   - Remove hardcoded `* 1600` multipliers from `app/creator-dashboard.tsx` and rely on backend-provided formatted currency amounts or explicit rate conversion utilities.
