---
name: Shared composer
description: MsComposer is the shared input for comments and DM screens; comment mode now matches DM InputBar visually.
---

# Shared composer — MsComposer

## Rule
`MsComposer` (`components/MsComposer.tsx`) is used by `app/post/[id].tsx` (comment mode) and any screen that needs the shared text composer. The full DM chat InputBar with animations (camera slide, mic recording pulse) lives in `app/chat/[id].tsx` as a local `InputBar` component.

## Comment mode now matches DM InputBar
After the redesign, `mode="comment"` is visually identical to the DM InputBar:

| Property | Value |
|---|---|
| Root background | `T.BG` |
| Pill background | `T.SURFACE` |
| Pill border-radius | `T.RADIUS.pill` (50) |
| Pill min-height | 50px |
| Pill padding | `paddingHorizontal: 4, paddingVertical: 4` |
| Left icon inside pill | `Smiley` emoji icon, 38×38 |
| Input | `flex: 1`, 15px, paddingHorizontal: 6, paddingTop/Bottom: 8 |
| Right button | 44×44 round `T.ACCENT` with `PaperPlaneTilt` icon |
| Row padding | `paddingHorizontal: 12, paddingVertical: 10, gap: 8` |

## Idle ↔ Send animation
- `idleAnim` (opacity/scale) shows a faint `T.SURFACE` ring with dimmed send icon when no text
- `sendAnim` shows the accent send button when text is present
- Runs via `Animated.parallel` on `hasText` change

## JSX spread ban
Metro bundler on this project rejects `{...props}` spread syntax on JSX elements — always destructure and pass props explicitly.

## Why
The user explicitly required comment input to look exactly like DM input. Keeping one shared component prevents visual drift.
