---
name: UI design system
description: Pill-shaped interactive elements, no input borders/outlines, dark-only theme, compact sizing.
---

# UI Design System

## The rule — interactive elements
All buttons, chips, search bars, filters, floating buttons, and action buttons use `borderRadius: T.RADIUS.pill` (50px) — pill shape.
Cards and content containers use T.RADIUS.lg (16px) or T.RADIUS.md (12px).

## Inputs — zero outline
- No `borderWidth` on focused inputs
- No white outlines, focus borders, or browser default outlines
- Focus is signalled by a subtle background color change (SURFACE → SURFACE_2)
- All TextInputs need `outlineStyle: 'none'` on web via Platform.OS check
- `global.css` has `* { outline: none !important }` for web safety net

## Typography sizes (reduced)
- Body: 14px (was 15-16px)
- Captions/meta: 12px (was 13px)
- Labels: 12px (was 13px)
- Button text: 15px (was 16px)

## Button heights (reduced)
- Primary action buttons: 46-50px (was 52-56px)
- Secondary / compact buttons: 34-40px (was 36-46px)

## Key files
- `constants/theme.ts` — T.RADIUS.pill = 50; all radius tokens
- `components/MsInput.tsx` — reference pill-shaped input implementation
- `global.css` — web outline removal, dark body background

**Why:** User requested globally reduced visual size, pill-shaped interactives, and zero input outlines.

**How to apply:** New inputs → copy MsInput pattern. New buttons → use borderRadius: T.RADIUS.pill. Never add borderWidth to inputs.
