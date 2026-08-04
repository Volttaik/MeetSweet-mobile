---
name: Tier badge system
description: How MsTierBadge works and where tier badges are rendered on post cards
---

MsTierBadge (`components/MsTierBadge.tsx`) is the single source of truth for all tier badge rendering. It uses `ContentTier` (bronze/silver/gold/diamond) from `constants/tiers.ts`.

- bronze → glowing dot (no text label)
- silver → frosted pill with Medal icon
- gold → frosted pill with Crown icon
- diamond → frosted pill with Diamond icon

`MsPostCard` imports and uses `MsTierBadge` directly — the old inline duplicate badge (tierDot/subsBadge styles) has been removed.

**Why:** Previously MsPostCard had its own inline badge that diverged from MsTierBadge. Consolidating ensures any design change to MsTierBadge is reflected everywhere.

**How to apply:** Always use `<MsTierBadge tier={...} size="xs" />` on card headers, `size="sm"` for larger contexts.
