/**
 * MsComposer — shared input component for comments and DM-style screens.
 *
 * mode="comment"  →  text + send button only (no voice, no attach)
 * mode="dm"       →  full feature set (used by chat)
 *
 * The DM mode is a slimmed integration point — the full chat InputBar
 * with all animations lives directly in chat/[id].tsx.
 */
import React, { useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PaperPlaneTilt, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';

interface ReplyInfo {
  authorName: string;
  onDismiss: () => void;
}

interface MsComposerProps {
  /** Controls which features are shown */
  mode?: 'comment' | 'dm';
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Show inline reply preview bar above the input */
  replyTo?: ReplyInfo | null;
  /** Called when user presses emoji button (dm mode) */
  onEmojiToggle?: () => void;
}

export function MsComposer({
  mode = 'comment',
  value,
  onChangeText,
  onSend,
  placeholder,
  maxLength = 500,
  disabled = false,
  replyTo,
}: MsComposerProps) {
  const inputRef = useRef<TextInput>(null);
  const canSend = value.trim().length > 0 && !disabled;

  const defaultPlaceholder =
    placeholder ?? (mode === 'comment' ? 'Add a comment…' : 'Message…');

  return (
    <View style={styles.root}>
      {/* Reply bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyAccent} />
          <Text style={styles.replyText} numberOfLines={1}>
            Replying to {replyTo.authorName}
          </Text>
          <TouchableOpacity
            onPress={replyTo.onDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.replyClose}
          >
            <X size={14} color={T.TEXT_2} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input row */}
      <View style={styles.row}>
        {/* Text field */}
        <View style={styles.pill}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={defaultPlaceholder}
            placeholderTextColor={T.TEXT_3}
            style={styles.input}
            multiline
            maxLength={maxLength}
            scrollEnabled={false}
            underlineColorAndroid="transparent"
            selectionColor={T.ACCENT}
            returnKeyType="default"
            blurOnSubmit={false}
            editable={!disabled}
          />
        </View>

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          <PaperPlaneTilt
            size={18}
            color={canSend ? '#fff' : T.TEXT_3}
            weight="fill"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: T.SURFACE,
  },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: T.SURFACE_2,
  },
  replyAccent: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: T.ACCENT,
    flexShrink: 0,
  },
  replyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  replyClose: {
    padding: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },

  pill: {
    flex: 1,
    backgroundColor: T.SURFACE_2,
    borderRadius: T.RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  input: {
    color: T.TEXT,
    fontSize: 15,
    fontFamily: T.FONT.regular,
    lineHeight: 22,
    maxHeight: 100,
    includeFontPadding: false,
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: T.SURFACE_2,
    shadowOpacity: 0,
    elevation: 0,
  },
});
