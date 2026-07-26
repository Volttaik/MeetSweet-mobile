---
name: Shadow system
description: Where shadows live and how to use them; icon naming gotcha.
---

# Shadow system

`T.SHADOWS.{soft,medium,hard,deep}` added to `constants/theme.ts` (inside the `T` object, before the closing brace).

```ts
soft:   { shadowColor:'#000', shadowOffset:{width:0,height:2},  shadowOpacity:0.10, shadowRadius:8,  elevation:3  }
medium: { shadowColor:'#000', shadowOffset:{width:0,height:4},  shadowOpacity:0.15, shadowRadius:12, elevation:6  }
hard:   { shadowColor:'#000', shadowOffset:{width:0,height:8},  shadowOpacity:0.25, shadowRadius:16, elevation:12 }
deep:   { shadowColor:'#000', shadowOffset:{width:0,height:12}, shadowOpacity:0.35, shadowRadius:24, elevation:20 }
```

Spread directly into StyleSheet: `...T.SHADOWS.medium`.

**Web warning:** `shadow*` props emit a deprecation warning on Expo web ("use boxShadow"). This is cosmetic — native still requires them.

**Icon gotcha:** `Film` does not exist in phosphor-react-native. Use `FilmStrip` instead.

**Why:** Centralised shadow tokens ensure consistent depth language across the app without per-component negotiation.

**How to apply:** Cards → medium, Inputs → soft, Modals → hard/deep, FABs → hard.
