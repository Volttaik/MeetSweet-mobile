import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { T, alpha } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OTPInputRef {
  shake: () => void;
  clear: () => void;
  focus: () => void;
}

interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
}

// ─── Single OTP box ───────────────────────────────────────────────────────────

interface BoxProps {
  digit: string;
  focused: boolean;
  hasError: boolean;
  inputRef: (ref: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onKeyPress: (key: string) => void;
  onPaste: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  autoFocus?: boolean;
}

function OtpBox({
  digit,
  focused,
  hasError,
  inputRef,
  onChangeText,
  onKeyPress,
  onPaste,
  onFocus,
  onBlur,
  autoFocus,
}: BoxProps) {
  const scale = useSharedValue(1);
  const prevDigit = useRef('');

  useEffect(() => {
    prevDigit.current = digit;
  }, [digit]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Box treatment matches the auth input system: translucent pill surface,
  // subtle border, white focus ring — not a heavy boxed look.
  const borderColor = hasError
    ? T.ERROR
    : focused
    ? T.ACCENT_FG
    : digit
    ? 'rgba(255,255,255,0.4)'
    : 'rgba(255,255,255,0.12)';

  const bgColor = hasError
    ? alpha(T.ERROR, 0.09)
    : focused
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(255,255,255,0.07)';

  return (
    <Animated.View style={animStyle}>
      <View
        style={[
          styles.box,
          {
            borderColor,
            backgroundColor: bgColor,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={digit}
          onChangeText={onChangeText}
          onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key)}
          // Web paste: react-native-web forwards the DOM ClipboardEvent here.
          // (Native paste arrives through onChangeText with the full string.)
          // Spread via a cast — RN's TextInputProps type has no onPaste.
          {...({
            onPaste: (e: unknown) => {
              const evt = e as { nativeEvent?: { clipboardData?: { getData?: (f: string) => string } }; clipboardData?: { getData?: (f: string) => string } };
              const clip = evt?.nativeEvent?.clipboardData ?? evt?.clipboardData;
              const text = typeof clip?.getData === 'function' ? clip.getData('text') : '';
              if (text) onPaste(text);
            },
          } as object)}
          onFocus={onFocus}
          onBlur={onBlur}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          // No maxLength — the controlled `digit` value keeps each box to one
          // character while allowing full-code pastes through handleChange.
          textAlign="center"
          selectionColor={T.CARET}
          caretHidden
          autoFocus={autoFocus}
          style={styles.boxText}
        />
      </View>
    </Animated.View>
  );
}

// ─── Main OTPInput ─────────────────────────────────────────────────────────────

const OTPInput = forwardRef<OTPInputRef, OTPInputProps>(function OTPInput(
  { length, value, onChange, onComplete, hasError = false, autoFocus = false },
  ref,
) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeX = useSharedValue(0);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(-1);

  useImperativeHandle(ref, () => ({
    shake: () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      shakeX.value = withSequence(
        withTiming(-11, { duration: 50 }),
        withTiming(11, { duration: 50 }),
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    },
    clear: () => {
      onChange('');
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    },
    focus: () => inputRefs.current[0]?.focus(),
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  // NOTE: no clipboard auto-paste here. Reading the clipboard on mount used to
  // prepopulate the field with a stale/random 6-digit value before the user
  // typed anything — the verification screen must always start empty. SMS code
  // autofill still works through the system (textContentType="oneTimeCode" /
  // autoComplete="one-time-code"), which is a user-initiated OS feature.
  const getDigits = (): string[] => {
    const arr: string[] = [];
    for (let i = 0; i < length; i++) arr.push(value[i] ?? '');
    return arr;
  };

  const handleChange = (text: string, index: number) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    const digits = getDigits();

    // Paste of a full/partial code — fill the boxes from this index onward.
    if (digitsOnly.length > 1) {
      for (let i = 0; i < digitsOnly.length && index + i < length; i++) {
        digits[index + i] = digitsOnly[i];
      }
      const next = digits.join('');
      onChange(next);
      const lastFilled = Math.min(index + digitsOnly.length - 1, length - 1);
      if (next.length === length) {
        inputRefs.current[lastFilled]?.blur();
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        onComplete?.(next);
      } else {
        setTimeout(() => inputRefs.current[lastFilled + 1]?.focus(), 10);
      }
      return;
    }

    const digit = digitsOnly.slice(-1);
    digits[index] = digit;
    const next = digits.join('');
    onChange(next);

    if (digit) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      if (index < length - 1) {
        setTimeout(() => inputRefs.current[index + 1]?.focus(), 10);
      } else {
        // Last box filled
        inputRefs.current[index]?.blur();
        if (next.length === length) {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          onComplete?.(next);
        }
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace') {
      const digits = getDigits();
      if (digits[index]) {
        digits[index] = '';
        onChange(digits.join(''));
      } else if (index > 0) {
        digits[index - 1] = '';
        onChange(digits.join(''));
        setTimeout(() => inputRefs.current[index - 1]?.focus(), 10);
      }
    }
  };

  const digits = getDigits();

  return (
    <Animated.View style={[styles.row, shakeStyle]}>
      {digits.map((digit, i) => (
        <OtpBox
          key={i}
          digit={digit}
          focused={focusedIndex === i}
          hasError={hasError}
          inputRef={(r) => {
            inputRefs.current[i] = r;
          }}
          onChangeText={(text) => handleChange(text, i)}
          onKeyPress={(key) => handleKeyPress(key, i)}
          onPaste={(text) => handleChange(text, i)}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() => setFocusedIndex(-1)}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </Animated.View>
  );
});

export default OTPInput;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: 46,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boxText: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: T.ACCENT_FG,
    includeFontPadding: false,
  },
});
