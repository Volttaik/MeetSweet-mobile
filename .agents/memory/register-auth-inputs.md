---
name: Register/auth input styling
description: Why we use RN TextInput instead of heroui Input, and the no-border rule for auth inputs.
---

# Register / Auth Input Styling

## Rule
Always use RN `TextInput` (not heroui `Input`) in `app/register.tsx` and `app/auth.tsx`.

**Why:** heroui-native's `Input` component injects its own focus ring / border when the parent `TextField` has `isInvalid={true}`, producing a pink/red border that cannot be overridden with `style` props. Plain RN `TextInput` gives full style control.

## How to apply
- `InputRow` wrapper (`View`) handles visual container with `backgroundColor` tint for error state (no `borderWidth`/`borderColor` on the wrapper).
- Error state = subtle `rgba(239,68,68,0.09)` background on wrapper + `FieldErr` text below. No colored border anywhere.
- For web, add `outlineStyle:'none', outlineWidth:0` to the TextInput style to suppress browser default focus ring.

## Register animation
- Use a simple fade-only transition (opacity 0→1) instead of slideX+opacity to avoid layout jank from step component mount/unmount.
- `useEffect` on `step` state triggers the fade-in after React commits the new step render.
- Memoize all step `onChange` / `onNext` callbacks with `useCallback` — prevents re-renders during the fade animation.
