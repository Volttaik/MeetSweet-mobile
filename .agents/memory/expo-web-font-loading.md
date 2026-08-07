---
name: Expo web font loading
description: Environment-specific guidance for preventing a blank Expo web preview during font loading.
---

On Expo web, do not block the entire router tree on `useFonts` finishing. Render the app with platform fallbacks while fonts load; keep the native splash-screen wait for iOS and Android.

**Why:** The Replit web preview can remain on the dark native background when a font request stalls, even though Metro bundled successfully and the browser reported no JavaScript exception.

**How to apply:** In the root layout, use a web-specific fallback for the font-loading gate and verify the preview screenshot after restarting the Expo workflow.