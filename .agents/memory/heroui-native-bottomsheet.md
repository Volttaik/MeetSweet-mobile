---
name: heroui-native BottomSheet requires @gorhom/bottom-sheet
description: heroui-native's BottomSheet component silently becomes undefined when @gorhom/bottom-sheet is not installed, causing "Element type is invalid" crash at render time.
---

heroui-native wraps the gorhom require in a try/catch so it doesn't throw at import time, but the resulting `GorhomBottomSheetPackage` is `undefined`. Any use of `BottomSheet.Content` therefore renders `undefined` as a component — causing the React "Element type is invalid" crash when the sheet is first opened.

**Why:** @gorhom/bottom-sheet is an optional peer dependency of heroui-native and is NOT installed in this project.

**How to apply:** Whenever a screen uses `BottomSheet` from `heroui-native`, replace it with a React Native `Modal` (transparent, animationType="slide") until @gorhom/bottom-sheet is explicitly installed. The fixed implementation is in `app/creator/[id].tsx`.
