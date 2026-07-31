/**
 * MsFileCard — document/file attachment card.
 * ~5px corner radius, premium card design.
 * Shows icon + filename + size + download state.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { File, FilePdf, FileZip, FileDoc, FileText, ArrowCircleDown } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { formatFileSize } from '@/types/chat-message';
import type { MsMessage } from '@/types/chat-message';

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  onPress?: () => void;
}

function getFileIcon(mimeType?: string, fileName?: string) {
  const name = (fileName ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf'))
    return <FilePdf size={28} color={T.ACCENT} weight="fill" />;
  if (mime.includes('zip') || name.endsWith('.zip') || name.endsWith('.rar'))
    return <FileZip size={28} color={T.PURPLE} weight="fill" />;
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx'))
    return <FileDoc size={28} color='#2196F3' weight="fill" />;
  if (mime.includes('text') || name.endsWith('.txt'))
    return <FileText size={28} color={T.TEXT_2} weight="fill" />;
  return <File size={28} color={T.TEXT_2} weight="fill" />;
}

function getFileLabel(mimeType?: string, fileName?: string): string {
  const name = (fileName ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF Document';
  if (mime.includes('zip') || name.endsWith('.zip')) return 'ZIP Archive';
  if (mime.includes('rar') || name.endsWith('.rar')) return 'RAR Archive';
  if (mime.includes('word') || name.endsWith('.docx')) return 'Word Document';
  if (mime.includes('text') || name.endsWith('.txt')) return 'Text File';
  return 'File';
}

export function MsFileCard({ message, position, onPress }: Props) {
  const isOwn = position === 'right';
  const filename = message.msFileName ?? 'Attachment';
  const size = message.msFileSize ? formatFileSize(message.msFileSize) : '';
  const label = getFileLabel(message.msMimeType, message.msFileName);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}
    >
      <View style={[styles.card, isOwn ? styles.cardRight : styles.cardLeft]}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          {getFileIcon(message.msMimeType, message.msFileName)}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.filename} numberOfLines={1} ellipsizeMode="middle">
            {filename}
          </Text>
          <Text style={styles.meta}>
            {label}{size ? ` · ${size}` : ''}
          </Text>
        </View>

        {/* Download */}
        <View style={styles.downloadBtn}>
          <ArrowCircleDown size={22} color={isOwn ? 'rgba(255,255,255,0.7)' : T.TEXT_2} weight="fill" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
  },
  containerLeft: { alignSelf: 'flex-start', marginLeft: 8 },
  containerRight: { alignSelf: 'flex-end', marginRight: 8 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 280,
    minWidth: 200,
    ...T.SHADOWS.soft,
  },
  cardLeft: {
    backgroundColor: T.SURFACE_2,
  },
  cardRight: {
    backgroundColor: T.ACCENT,
  },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  info: {
    flex: 1,
    gap: 3,
  },
  filename: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  meta: {
    fontSize: 11,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  downloadBtn: {
    flexShrink: 0,
  },
});
