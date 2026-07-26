---
name: Border removal system
description: Which borders were removed and the rule for future UI — elevation/spacing only, no visible lines.
---

# Border Removal — Completed Screens

**Why:** Design system requires no white/grey separator lines; spacing and background contrast serve as visual hierarchy.

## Rule
- Never add `borderWidth` to cards, list rows, input containers, or header separators
- Use background color contrast (T.SURFACE vs T.BG vs T.SURFACE_2) to define depth
- Active/selected states: use `backgroundColor: T.ACCENT_LIGHT` (no border)
- Exception: `bubblePaid` retains `borderWidth: 1, borderColor: T.ACCENT` — intentional accent indicator

## Removed in this session
- `app/chat/[id].tsx`: header `borderBottomWidth`, `bubbleOther` border, `rbs.wrap` (reply bar) `borderTopWidth`, `lps.action` `borderBottomWidth`, `floatDateBadge` border
- `app/create-post.tsx`: header `borderBottomWidth`, `captionWrap` border, `visibilityOption` border, `visibilityOptionActive` `borderColor`, `paidToggleRow` border, `paidToggleRowActive` `borderColor`, `creditPriceRow` border, `chip` border, `chipActive` `borderColor`, `tagChip` border, `previewCaption` border, `previewMeta` `borderBottomWidth`, `errorBanner` border, `mediaOption` `borderTopWidth`, `skipOption` `borderTopWidth`, `paidBadge` border

**How to apply:** Search for `borderWidth` in new components — if it's a card/list/input, remove it. Keep borders only where they carry deliberate semantic meaning (e.g. paid content accent ring).
