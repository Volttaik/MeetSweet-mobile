/**
 * ChatHeader — the private-thread header, as a standalone component.
 *
 * Part of the chat screen's persistent UI shell: it mounts immediately with
 * the screen and NEVER waits for the message list's data request. The back
 * button and conversation-actions button are interactive from the very first
 * frame; the identity block (avatar + name) shows a neutral placeholder until
 * the thread payload arrives, then swaps in the real identity without the
 * header ever unmounting or shifting.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, DotsThreeVertical } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';

interface ChatHeaderProps {
  /** Other participant's display name (null while the thread is loading). */
  name?: string | null;
  /** Other participant's avatar URL (null while loading / when unset). */
  avatarUri?: string | null;
  /** Header subtitle — e.g. "Waiting for your approval". */
  subtitle?: string;
  onBack: () => void;
  onMenu: () => void;
}

export function ChatHeader({ name, avatarUri, subtitle, onBack, onMenu }: ChatHeaderProps) {
  const displayName = name?.trim() ? name : 'Conversation';
  const initials = (displayName || 'C').slice(0, 2).toUpperCase();
  const sub = subtitle?.trim() ? subtitle : 'Private correspondence';

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.iconBtn}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={22} color={T.TEXT} />
      </Pressable>

      <View style={styles.headerCenter}>
        <View style={styles.headerIdentity}>
          <MsAvatar size={34} initials={initials} imageUri={avatarUri ?? undefined} />
          <View style={styles.identityText}>
            <Text style={styles.title} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={onMenu}
        style={styles.iconBtn}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Conversation actions"
      >
        <DotsThreeVertical size={20} color={T.TEXT} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.SURFACE,
  },
  headerCenter: { flex: 1, marginHorizontal: 10 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityText: { flex: 1, gap: 0 },
  title: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 },
  subtitle: { color: T.TEXT_3, fontSize: 11, fontFamily: T.FONT.regular, marginTop: 1 },
});
