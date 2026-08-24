import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, ShareNetwork, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAvatar } from '@/components/MsAvatar';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { createShareLink } from '@/services/sharing';

interface SharePreview {
  /** Main human-readable title (profile name, post title, album title). */
  title?: string;
  /** Secondary line — e.g. @username for profiles, creator name for posts. */
  subtitle?: string;
  /** Thumbnail / cover image (posts, albums, videos). */
  imageUrl?: string;
  /** Avatar for profile shares. */
  avatarUrl?: string;
}

interface Props {
  visible: boolean;
  contentType: string;
  contentId: string;
  title?: string;
  /** Human-readable content preview — shows the user WHAT they are sharing
   *  instead of raw ids or technical link text. */
  preview?: SharePreview;
  onClose: () => void;
}

export function MsShareSheet({ visible, contentType, contentId, title = 'Share', preview, onClose }: Props) {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  React.useEffect(() => {
    if (visible) {
      setLink('');
      setMessage('');
      setLoading(false);
    }
  }, [visible, contentId]);

  const getLink = async () => {
    if (link) return link;
    setLoading(true);
    setMessage('');
    try {
      const typeStr = String(contentType);
      const result = await createShareLink(typeStr, contentId);
      if (!result.url) throw new Error('The share link was not returned.');
      setLink(result.url);
      return result.url;
    } catch {
      setMessage('Sharing is unavailable right now. Please try again.');
      return '';
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    const url = await getLink();
    if (url) {
      await Clipboard.setStringAsync(url);
      setMessage('Link copied');
    }
  };

  const nativeShare = async () => {
    const url = await getLink();
    const shareTitle = preview?.title || title;
    if (url) await Share.share({ title: shareTitle, message: `${shareTitle}\n${url}`, url });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />

          {/* Human-readable preview — shows the actual name/title being shared */}
          {preview ? (
            <View style={styles.previewRow}>
              {preview.avatarUrl ? (
                <MsAvatar size={46} imageUri={preview.avatarUrl} initials={(preview.title ?? '?').slice(0, 2).toUpperCase()} />
              ) : preview.imageUrl ? (
                <View style={styles.previewThumb}>
                  <MsMediaLoader uri={preview.imageUrl} style={styles.previewThumbImg} resizeMode="cover" accessibleLabel="Shared content" />
                </View>
              ) : null}
              <View style={styles.previewText}>
                {preview.title ? <Text style={styles.previewTitle} numberOfLines={1}>{preview.title}</Text> : null}
                {preview.subtitle ? <Text style={styles.previewSubtitle} numberOfLines={1}>{preview.subtitle}</Text> : null}
              </View>
            </View>
          ) : null}

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Share with friends</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close share sheet">
              <X size={18} color={T.TEXT_2} />
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={T.TEXT_2} style={styles.loader} /> : null}
          <Pressable style={styles.action} onPress={copy} disabled={loading}>
            <View style={styles.icon}><Copy size={20} color={T.TEXT} /></View>
            <View><Text style={styles.actionTitle}>Copy link</Text><Text style={styles.actionCopy}>Copy the link to share it anywhere</Text></View>
          </Pressable>
          <Pressable style={styles.action} onPress={nativeShare} disabled={loading}>
            <View style={styles.icon}><ShareNetwork size={20} color={T.TEXT} /></View>
            <View><Text style={styles.actionTitle}>Share</Text><Text style={styles.actionCopy}>Send it to friends or other apps</Text></View>
          </Pressable>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { backgroundColor: T.SURFACE, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34 },
  handle: { width: 36, height: 4, borderRadius: 4, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 18 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.SURFACE_2,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  previewThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    overflow: 'hidden',
  },
  previewThumbImg: { width: '100%', height: '100%' },
  previewText: { flex: 1, gap: 2 },
  previewTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  previewSubtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 20 },
  subtitle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 3 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  loader: { marginBottom: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: T.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14 },
  actionCopy: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 3 },
  message: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
