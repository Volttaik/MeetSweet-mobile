/**
 * MsInput — the standard text input for MeetSweet.
 *
 * Design: soft dark background, fully rounded pill shape, no visible
 * outline/border on focus (uses subtle background shift instead).
 * Works in both standard and password modes.
 */
import React, { ReactNode, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@/constants/theme';

interface MsInputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightElement?: ReactNode;
  /** Compact variant — reduces height and padding */
  compact?: boolean;
}

export default function MsInput({
  label,
  error,
  secureTextEntry,
  rightElement,
  style,
  compact = false,
  ...props
}: MsInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          props.multiline && styles.inputRowMultiline,
          compact && styles.inputRowCompact,
          isFocused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            compact && styles.inputCompact,
            props.multiline && styles.inputMultiline,
            style,
          ]}
          placeholderTextColor={T.TEXT_3}
          selectionColor="#888"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={secureTextEntry && !showPassword}
          {...props}
        />
        {secureTextEntry && (
          <MsPressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={18}
              color={T.TEXT_3}
            />
          </MsPressable>
        )}
        {!secureTextEntry && rightElement}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
    marginBottom: 5,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 18,
    // No border by default — background change signals focus
    borderWidth: 0,
    height: 48,
    gap: 8,
  },
  inputRowCompact: {
    height: 40,
    paddingHorizontal: 14,
  },
  inputRowMultiline: {
    height: 'auto',
    minHeight: 48,
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  inputFocused: {
    backgroundColor: T.SURFACE_2,
  },
  inputError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  input: {
    flex: 1,
    color: T.TEXT,
    fontSize: 14,
    fontFamily: T.FONT.regular,
    // Mobile vertical-centering: Android TextInput adds its own internal
    // top/bottom padding, and the glyph baseline varies per font — without
    // these the text sits visibly off-centre inside the fixed-height row and
    // the cursor is offset from the text. includeFontPadding:false + zero
    // vertical padding let the row's alignItems:center do the centering.
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputCompact: {
    fontSize: 13,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.ERROR,
    marginTop: 4,
    marginLeft: 6,
  },
});
