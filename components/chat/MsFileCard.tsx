/**
 * MsFileCard — document/file attachment card.
 * 8px corner radius, dark-gray theme (no pink background on outgoing).
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  File, FilePdf, FileZip, FileDoc, FileText, ArrowCircleDown,
  CheckCircle, WarningCircle,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { formatFileSize } from '@/types/chat-message';
import type { MsMessage } from '@/types/chat-message';

const BG_OWN   = '#28282F';
const BG_OTHER = '#1C1C23';

interface Props {
  message: MsMessage;
  position: 'left' | 'right';
  onPress?: () => void;
}

function getFileIcon(mimeType?: string, fileName?: string) {
  const name = (fileName ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('pdf')  || name.endsWith('.pdf'))
    return <FilePdf  size={24} color={T.ACCENT}   weight="fill" />;
  if (mime.includes('zip')  || name.endsWith('.zip') || name.endsWith('.rar'))
    return <FileZip  size={24} color="#9C6FE4"     weight="fill" />;
  if (mime.includes('word') || name.endsWith('.doc')  || name.endsWith('.docx'))
    return <FileDoc  size={24} color="#2196F3"     weight="fill" />;
  if (mime.includes('text') || name.endsWith('.txt'))
    return <FileText size={24} color={T.TEXT_2}    weight="fill" />;
  return   <File     size={24} color={T.TEXT_2}    weight="fill" />;
}

function getFileLabel(mimeType?: string, fileName?: string): string {
  const name = (fileName ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('pdf')  || name.endsWith('.pdf'))  return 'PDF Document';
  if (mime.includes('zip')  || name.endsWith('.zip'))  return 'ZIP Archive';
  if (mime.includes('rar')  || name.endsWith('.rar'))  return 'RAR Archive';
  if (mime.includes('word') || name.endsWith('.docx')) return 'Word Document';
  if (mime.includes('text') || name.endsWith('.txt'))  return 'Text File';
  return 'File';
}

export function MsFileCard({ message, position, onPress }: Props) {
  const isOwn    = position === 'right';
  const filename = message.msFileName ?? 'Attachment';
  const size     = message.msFileSize ? formatFileSize(message.msFileSize) : '';
  const label    = getFileLabel(message.msMimeType, message.msFileName);

  // Local availability drives the trailing affordance:
  //  • 'local'      → check (file is on disk, opens offline)
  //  • 'downloading' → spinner (fetching on demand)
  //  • 'failed'      → warning (tap to retry)
  //  • 'remote'/undef → download arrow (tap to fetch)
  const status = message.msMediaStatus;
  const iconColor = isOwn ? 'rgba(255,255,255,0.55)' : T.TEXT_3;

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

        {/* Local-availability affordance */}
        <View style={styles.downloadBtn}>
          {status === 'downloading' ? (
            <ActivityIndicator size="small" color={T.ACCENT} />
          ) : status === 'failed' ? (
            <WarningCircle size={20} color="#F56565" weight="fill" />
          ) : status === 'local' ? (
            <CheckCircle size={20} color={T.ACCENT} weight="fill" />
          ) : (
            <ArrowCircleDown size={20} color={iconColor} weight="fill" />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 1 },
  containerLeft:  { alignSelf: 'flex-start', marginLeft: 8  },
  containerRight: { alignSelf: 'flex-end',   marginRight: 8 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 270,
    minWidth: 190,
  },
  cardLeft: {
    backgroundColor: BG_OTHER,
    borderBottomLeftRadius: 3,
  },
  cardRight: {
    backgroundColor: BG_OWN,
    borderBottomRightRadius: 3,
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  info: {
    flex: 1,
    gap: 2,
  },
  filename: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: T.TEXT,
  },
  meta: {
    fontSize: 10,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
  },

  downloadBtn: { flexShrink: 0 },
});
