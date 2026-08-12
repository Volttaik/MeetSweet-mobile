/**
 * MsComposer — shared input component for comments and DM screens.
 *
 * mode="comment"  → matches DM InputBar visually; voice/attach disabled
 * mode="dm"       → full feature set integration point (used by screens that need the shared composer)
 *
 * Visual design follows the DM InputBar exactly:
 * - T.BG wrapper background
 * - T.SURFACE pill with T.RADIUS.pill border-radius
 * - Emoji icon inside pill (left side) in comment mode
 * - 44px round T.ACCENT send button outside pill (mic↔send layout)
 * - min-height 50px pill
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PaperPlaneRight, Smiley, X } from 'phosphor-react-native';
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
  /** Called when user presses emoji button */
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
  onEmojiToggle,
}: MsComposerProps) {
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const canSend = hasText && !disabled;

  // Mic ↔ Send animation (comment mode: mic hidden, send fades in when typing)
  const sendAnim = useRef(new Animated.Value(hasText ? 1 : 0)).current;
  const idleAnim = useRef(new Animated.Value(hasText ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sendAnim, {
        toValue: hasText ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(idleAnim, {
        toValue: hasText ? 0 : 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [hasText]);

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

      {/* Input row — matches DM InputBar layout exactly */}
      <View style={styles.row}>
        {/* Pill: emoji icon + text input */}
        <View style={styles.pill}>
          {/* Emoji — left inside pill */}
          <TouchableOpacity
            style={styles.pillIcon}
            onPress={onEmojiToggle}
            activeOpacity={0.7}
          >
            <Smiley size={22} color={T.TEXT_2} />
          </TouchableOpacity>

          {/* Text input */}
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
            selectionColor="#888"
            returnKeyType="default"
            blurOnSubmit={false}
            editable={!disabled}
          />
        </View>

        {/* Right button — idle ring fades out, send fades in (same as DM InputBar) */}
        <View style={styles.rightBtn}>
          {/* Idle state: faint ring (no mic for comments) */}
          <Animated.View
            style={[
              styles.btnAbsolute,
              { opacity: idleAnim, transform: [{ scale: idleAnim }] },
            ]}
            pointerEvents={hasText ? 'none' : 'auto'}
          >
            <View style={[styles.actionBtn, styles.actionBtnIdle]}>
              <PaperPlaneRight size={20} color={T.TEXT_3} weight="fill" />
            </View>
          </Animated.View>

          {/* Send button */}
          <Animated.View
            style={[
              styles.btnAbsolute,
              { opacity: sendAnim, transform: [{ scale: sendAnim }] },
            ]}
            pointerEvents={canSend ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onSend}
              activeOpacity={0.8}
              disabled={!canSend}
            >
              <PaperPlaneRight size={20} color="#fff" weight="fill" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: T.BG,
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
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },

  // Pill — identical to DM InputBar pill
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 50,
  },
  pillIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: T.FONT.regular,
    color: T.TEXT,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    includeFontPadding: false,
    maxHeight: 120,
  },

  // Right button container — identical sizing to DM InputBar
  rightBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  btnAbsolute: {
    position: 'absolute',
  },
  actionBtn: {
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
    elevation: 4,
  },
  actionBtnIdle: {
    backgroundColor: T.SURFACE,
    shadowOpacity: 0,
    elevation: 0,
  },
});
