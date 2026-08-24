import { ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

/**
 * KeyboardAwareScrollViewCompat — the single shared keyboard-aware scroll
 * container for MeetSweet forms.
 *
 * Uses react-native-keyboard-controller's KeyboardAwareScrollView (which needs
 * the KeyboardProvider already mounted in _layout.tsx). It reads the real
 * keyboard height on Android + iOS and scrolls the focused input into view with
 * a small breathing gap (bottomOffset), so the keyboard never covers the
 * active field.
 *
 * Use this INSTEAD of a plain ScrollView on any screen that contains a
 * TextInput.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = 12,
  ...props
}: Props) {
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
