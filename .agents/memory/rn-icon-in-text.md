---
name: phosphor-react-native icons must not be children of <Text>
description: Rendering a React Native icon component as a child of <Text> causes a native crash on both iOS and Android.
---

React Native's <Text> component only accepts text content (strings, nested <Text>). Placing any non-text component (like phosphor-react-native icons) inside <Text> throws: "Cannot add a child that doesn't have a YogaNode to a parent without a measure function."

**Why:** Found and fixed in app/(tabs)/profile.tsx (3 occurrences at grid media cells) and app/wallet.tsx (secure checkout label).

**How to apply:** Always wrap icon-only renders in <View> with appropriate flex/alignment styles. For mixed icon+text, use a <View style={{flexDirection:'row', alignItems:'center'}}> containing the icon and a separate <Text>.
