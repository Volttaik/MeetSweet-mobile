---
name: Conversation participant identity
description: Durable rule for opening direct chats and rendering the other participant.
---

The profile/user ID sent to conversation creation and the conversation/room ID used for message routes are different identifiers. Always create or open the room first, then navigate with the returned room ID. Resolve the header identity from the conversation's `other_user` data, including `display_name` and avatar fields, rather than relying only on route params or stale local cache.

**Why:** Opening a chat from a creator profile previously passed a profile identifier through an incomplete conversation response, producing message-route 404s and blank participant metadata. Search worked because its result already carried the canonical user identity.

**How to apply:** Keep all entry points (creator profiles, search, notifications, content pages) on the same `createConversation(targetUserId) → conversationId → /chat/:conversationId` flow, and normalize snake_case and camelCase participant fields together.