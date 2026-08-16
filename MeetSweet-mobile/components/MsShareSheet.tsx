import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, ShareNetwork, X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { createShareLink } from '@/services/sharing';

interface Props {
  visible: boolean;
  contentType: string;
  contentId: string;
  title?: string;
  onClose: () => void;
}

export function MsShareSheet({ visible, contentType, contentId, title = 'Share', onClose }: Props) {
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
    if (url) await Share.share({ title, message: `${title}\n${url}`, url });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Share from MeetSweet</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close share sheet">
              <X size={18} color={T.TEXT_2} />
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={T.TEXT_2} style={styles.loader} /> : null}
          <Pressable style={styles.action} onPress={copy} disabled={loading}>
            <View style={styles.icon}><Copy size={20} color={T.TEXT} /></View>
            <View><Text style={styles.actionTitle}>Copy link</Text><Text style={styles.actionCopy}>Get a backend-generated deep link</Text></View>
          </Pressable>
          <Pressable style={styles.action} onPress={nativeShare} disabled={loading}>
            <View style={styles.icon}><ShareNetwork size={20} color={T.TEXT} /></View>
            <View><Text style={styles.actionTitle}>Share to other apps</Text><Text style={styles.actionCopy}>Use the native share sheet</Text></View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
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