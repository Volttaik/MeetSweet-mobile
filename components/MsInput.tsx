import React, { ReactNode, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeSlash } from 'phosphor-react-native';
import { T } from '@/constants/theme';

interface MsInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  rightElement?: ReactNode;
  leftElement?: ReactNode;
}

export default function MsInput({
  label,
  error,
  hint,
  secureTextEntry,
  rightElement,
  leftElement,
  style,
  multiline,
  ...props
}: MsInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const borderAnim = React.useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(borderAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    props.onFocus?.({ nativeEvent: {} } as any);
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.timing(borderAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
    props.onBlur?.({ nativeEvent: {} } as any);
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? T.DANGER : T.BORDER_2,
      error ? T.DANGER : T.BORDER_FOCUS,
    ],
  });

  const bgColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [T.SURFACE, T.SURFACE_2],
  });

  return (
    <View style={styles.wrapper}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Animated.View
        style={[
          styles.inputRow,
          multiline && styles.multilineRow,
          { borderColor, backgroundColor: bgColor },
        ]}
      >
        {!!leftElement && <View style={styles.leftEl}>{leftElement}</View>}
        <TextInput
          style={[
            styles.input,
            multiline && styles.multilineInput,
            style,
          ]}
          placeholderTextColor={T.TEXT_MUTED}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry && !showPassword}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.rightEl}
          >
            {showPassword
              ? <EyeSlash size={20} color={T.TEXT_2} />
              : <Eye size={20} color={T.TEXT_2} />}
          </TouchableOpacity>
        )}
        {!secureTextEntry && rightElement && (
          <View style={styles.rightEl}>{rightElement}</View>
        )}
      </Animated.View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },

  label: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    marginLeft: 2,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: T.RADIUS.md,
    paddingHorizontal: 16,
    borderWidth: 1,
    height: 52,
    gap: 10,
  },

  multilineRow: {
    height: undefined,
    minHeight: 100,
    paddingTop: 14,
    paddingBottom: 14,
    alignItems: 'flex-start',
  },

  leftEl: { marginRight: 2 },
  rightEl: { marginLeft: 2 },

  input: {
    flex: 1,
    color: T.TEXT,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    letterSpacing: -0.1,
  },

  multilineInput: {
    paddingTop: 0,
    lineHeight: 22,
  },

  error: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.DANGER,
    marginLeft: 4,
  },

  hint: {
    fontSize: 12,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    marginLeft: 4,
  },
});
