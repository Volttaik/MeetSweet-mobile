import React from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

/**
 * KeyboardAwareScrollViewCompat — the single shared keyboard-aware scroll
 * container for MeetSweet forms.
 *
 * On native it uses react-native-keyboard-controller's KeyboardAwareScrollView
 * (which needs the KeyboardProvider already mounted in _layout.tsx). It reads
 * the real keyboard height on Android + iOS and scrolls the focused input into
 * view with a small breathing gap (bottomOffset), so the keyboard never covers
 * the active field. On web it degrades to a plain ScrollView.
 *
 * Use this INSTEAD of a plain ScrollView on any screen that contains a
 * TextInput. A ref is forwarded so callers can scrollTo (e.g. jumping to a
 * message) exactly like a plain ScrollView.
 */
export const KeyboardAwareScrollViewCompat = React.forwardRef<
  React.ComponentRef<typeof ScrollView>,
  Props
>(function KeyboardAwareScrollViewCompat(
  {
    children,
    keyboardShouldPersistTaps = 'handled',
    bottomOffset = 12,
    ...props
  },
  ref,
) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        ref={ref as React.Ref<React.ComponentRef<typeof ScrollView>>}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      ref={ref as unknown as React.Ref<React.ComponentRef<typeof KeyboardAwareScrollView>>}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});
