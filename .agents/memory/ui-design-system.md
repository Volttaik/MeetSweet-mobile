---
name: UI design system
description: Design language rules — pill radius, no borders, dark frosted buttons, rose gradient background.
---

# MeetSweet UI Design System

## Color palette
- `T.ACCENT`: `#C45A72` (muted warm rose)
- `T.BG`: `#0D0A0C` (near-black charcoal)
- `T.SURFACE`: `#1E1418` (dark rose-tinted card)
- `T.SURFACE_2`: `#251A20` (lighter rose-tinted surface)
- `RoseGradient`: `['#220F1A', '#170C13', '#0D0A0C']` — warm dark rose fading to near-black (exported from `constants/theme.ts`)

## Key rules
- **Pill radius** (`T.RADIUS.pill = 50`) for ALL interactive elements: inputs, buttons, chips
- **No borders** on inputs (borderWidth: 0 or transparent)
- **No top border** on the tab bar
- **Dark frosted buttons**: `backgroundColor: 'rgba(255,255,255,0.1)'` + `borderColor: 'rgba(255,255,255,0.15)'` + white text (NOT pink/accent)
- Input focus: shift to darker bg, no outline ring
- Global CSS removes all browser outlines

## Background components
- `MsScreenBackground` (`components/MsScreenBackground.tsx`) — LinearGradient rose bg for auth/onboarding screens
- `MsAmbientBackground` (`components/MsAmbientBackground.tsx`) — full rose gradient + ambient glow overlay for feed/home tab

## Sizing
- Input height: 54px (was 46px)
- Button height: 56px (was 46px)
- Input font size: 15px (was 14px)
- Button font size: 16px

**Why:** Premium dark-rose aesthetic; no borders keeps the glassy/dark look. Pink buttons felt gaudy against the rose gradient background.
