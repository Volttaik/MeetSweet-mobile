/**
 * MsReplyPreviewBubble — inline reply context shown above a bubble.
 * Shows the quoted message content (text, image, voice, etc.)
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ArrowBendUpLeft } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import type { ReplyMessage } from '@kesha-antonov/react-native-chat';

interface Props {
  reply: ReplyMessage;
  position: 'left' | 'right';
}

export function MsReplyPreviewBubble({ reply, position }: Props) {
  const isOwn = position === 'right';
  const senderName = reply.user?.name ?? 'Someone';
  const hasImage = !!reply.image;

  return (
    <View style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}>
      <View style={[styles.accent, isOwn ? styles.accentOwn : styles.accentOther]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <ArrowBendUpLeft size={11} color={isOwn ? 'rgba(255,255,255,0.6)' : T.TEXT_3} />
          <Text style={[styles.senderName, isOwn ? styles.senderNameOwn : styles.senderNameOther]}>
            {senderName}
          </Text>
        </View>
        {hasImage ? (
          <View style={styles.imageRow}>
            <Image source={{ uri: reply.image }} style={styles.thumb} />
            <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]} numberOfLines={1}>
              {reply.text || 'Photo'}
            </Text>
          </View>
        ) : (
          <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]} numberOfLines={2}>
            {reply.text || (reply.audio ? 'Voice note' : 'Attachment')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 3,
    maxWidth: 260,
  },
  containerLeft: {
    alignSelf: 'flex-start',
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  containerRight: {
    alignSelf: 'flex-end',
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  accent: {
    width: 3,
    flexShrink: 0,
  },
  accentOwn: { backgroundColor: 'rgba(255,255,255,0.7)' },
  accentOther: { backgroundColor: T.ACCENT },

  body: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  senderName: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
  },
  senderNameOwn: { color: 'rgba(255,255,255,0.75)' },
  senderNameOther: { color: T.ACCENT },

  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: 3,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontFamily: T.FONT.regular,
    lineHeight: 17,
  },
  textOwn: { color: 'rgba(255,255,255,0.8)' },
  textOther: { color: T.TEXT_2 },
});
