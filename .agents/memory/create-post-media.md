---
name: Create-post media flow
description: Correct two-step flow for creating a post with media: upload first, then pass media_ids to createPost.
---

# Create-post media flow

**Why:** Old code was passing `mediaUrl`, `mediaType`, `isPremium`, `fileSize` to createPost. None of these are accepted by the backend. The backend requires `media_ids` (an array of uploaded media UUIDs).

## Correct flow
1. User picks media → `uploadMedia(uri, mime, name, progressCb)` → returns `{ id, url, type, ... }`
2. Capture `result.id` → `mediaIds = [result.id]`
3. Call `createPost({ caption, visibility, media_ids: mediaIds, categories, tags })`

## CreatePostData interface (services/posts.ts)
```ts
interface CreatePostData {
  caption?: string;
  visibility?: 'public' | 'subscribers' | 'draft';
  media_ids?: string[];
  unlock_price?: number;
  preview_duration?: number;
  expires_at?: string;
  categories?: string[];
  tags?: string[];
}
```

**How to apply:** Any screen creating posts must follow the upload→id→media_ids pattern. Never pass mediaUrl/mediaType directly to createPost.
