---
name: Color scheme migration
description: Rose-tinted dark backgrounds replaced with neutral ash shadow grey; selectionColor neutralized across all inputs.
---

# Color Scheme Migration — Rose → Ash Shadow Grey

## The rule
All dark background colors changed from rose-tinted to neutral grey. T.ACCENT (rose #C45A72) stays as the interactive accent color only.

**Why:** User found warm rose backgrounds visually straining. Grey backgrounds provide better contrast with dark cards and white text.

## New values in constants/theme.ts
- `T.BG`: `#0C0C0F` (was `#120B10`)
- `T.SURFACE`: `#161619` (was `#1E1218`)
- `T.SURFACE_2`: `#1E1E24` (was `#261620`)
- `T.AMBIENT`: `rgba(180,185,210,0.06)` (was rose `rgba(196,90,114,0.11)`)
- `RoseGradient.colors`: `['#131318', '#0F0F13', '#09090C']` (was `['#23101A', '#170C13', '#0D0A0C']`)

## selectionColor changes (all inputs)
Changed `selectionColor={T.ACCENT}` → `selectionColor="#888"` in:
- `components/MsInput.tsx`
- `components/MsComposer.tsx`
- `components/MsGifPicker.tsx`
- `app/chat/[id].tsx`
- `app/create-post.tsx` (3 occurrences)

## How to apply
Any new TextInput should use `selectionColor="#888"`. Any new screen background should use `T.BG`, `T.SURFACE`, or `T.SURFACE_2` from the updated theme.
