/**
 * MsHapticsPrompt — small, clean modal shown on the user's FIRST haptic
 * experience asking whether to keep vibrations on. Matches the app's styled
 * modal language (dark card, rounded, accent action). The choice is persisted
 * via lib/haptics and controls every haptic call site in the app.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Vibrate } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { resolveHapticsPrompt } from '@/lib/haptics';

export function MsHapticsPrompt({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const choose = (value: boolean) => {
    resolveHapticsPrompt(value).catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => choose(true)}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={() => choose(true)}>
        <View style={[styles.card, { marginTop: Math.max(insets.top, 24) }]}>
          <View style={styles.iconWrap}>
            <Vibrate size={22} color={T.TEXT} weight="fill" />
          </View>
          <Text style={styles.title}>Vibrations</Text>
          <Text style={styles.message}>
            MeetSweet can use gentle vibrations for likes, messages, and sends.
            Turn them on?
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.disableBtn}
              onPress={() => choose(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.disableLabel}>Keep Off</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.enableBtn}
              onPress={() => choose(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.enableLabel}>Enable</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    ...T.SHADOWS.soft,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 20,
  },
  buttons: { flexDirection: 'row', gap: 10, width: '100%' },
  disableBtn: {
    flex: 1,
    height: 46,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disableLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.TEXT },
  enableBtn: {
    flex: 1,
    height: 46,
    borderRadius: T.RADIUS.md,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableLabel: { fontSize: 13, fontFamily: T.FONT.semibold, color: T.BG },
});
