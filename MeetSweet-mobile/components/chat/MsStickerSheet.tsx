/**
 * MsStickerSheet — emoji sticker picker for the chat composer.
 *
 * Stickers are a first-class message type in MeetSweet: the app ships a
 * curated emoji sticker set (no external service, works offline, zero
 * assets) and sends each pick as a message. A single-emoji text message
 * renders as a floating large-emoji sticker (MsChatBubble → isSticker), so
 * the pick → send → render → persist path is instant and survives reloads
 * exactly like any other text message.
 *
 * The Android keyboard's native GIF/sticker insertion (Gboard commitContent)
 * is not reachable from React Native 0.81 (no InputConnection.commitContent
 * support) and Expo Go cannot host custom native modules — this sheet is the
 * supported in-app entry point for stickers. Animated GIFs have their own
 * entry point (attachment sheet → GIF), and arrive as media_type 'gif'.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';
import { T } from '@/constants/theme';

/** Curated emoji sticker set — expressive, cross-platform, no assets needed. */
const STICKERS = [
  '😂', '🥹', '😍', '😘', '😎', '🤩',
  '🥳', '😜', '🤪', '😝', '😅', '😭',
  '😤', '😡', '🤯', '😳', '🥺', '😇',
  '🤗', '🤔', '🙃', '😴', '🤤', '😻',
  '🙈', '🙉', '🙊', '💀', '👻', '🤖',
  '👏', '🙌', '👍', '👎', '👊', '✌️',
  '🤞', '🤟', '🤘', '💪', '🫶', '❤️',
  '🧡', '💛', '💚', '💙', '💜', '🖤',
  '💯', '🔥', '✨', '⭐', '🎉', '🎊',
  '🎁', '🌈', '☀️', '🌙', '⚡', '🍀',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export function MsStickerSheet({ visible, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Stickers</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close stickers">
              <X size={18} color={T.TEXT_2} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
          >
            {STICKERS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.cell}
                onPress={() => onPick(emoji)}
                activeOpacity={0.7}
                accessibilityLabel={`Send ${emoji} sticker`}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
    maxHeight: '62%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 4,
  },
  cell: {
    width: '16.66%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 36,
    includeFontPadding: false,
  },
});
