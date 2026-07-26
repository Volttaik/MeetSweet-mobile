---
name: Test accounts seeded
description: 5 creator test accounts registered on the live backend with avatars and posts.
---

# Test Accounts Seeded on Live Backend

## Accounts (all password: Test@12345)
| Username | Email | Avatar (Unsplash) |
|----------|-------|-------------------|
| luna_creates_ms | luna_ms_test@tempmail.dev | photo-1494790108377-be9c29b29330 |
| maya_content_ms | maya_ms_test@tempmail.dev | photo-1529626455594-4ff0802cfb7e |
| sophie_stories_ms | sophie_ms_test@tempmail.dev | photo-1544005313-94ddf0286df2 |
| emma_exclusive_ms | emma_ms_test@tempmail.dev | photo-1531746020798-e6953c6e8e04 |
| chloe_crafted_ms | chloe_ms_test@tempmail.dev | photo-1520813792240-56fc4a3765a7 |

## Posts created
Each account has 1–2 public posts with captions and hashtags.

## Notes
- Backend: `https://meetsweet-server.quizmi.space/api`
- PATCH /users/me IS implemented — bio and avatar_url both work
- Access tokens expire in 15 min; refresh tokens last ~30 days
- Email verification is NOT required — registration returns tokens immediately
