import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { getContentComments, addContentComment, type ContentComment, type ContentKind } from '@/services/content';
import { MsAvatar } from '@/components/MsAvatar';
import { MsComposer } from '@/components/MsComposer';

export function MsContentComments({ kind, contentId, visible, onClose, count = 0 }: { kind: ContentKind; contentId: string; visible: boolean; onClose: () => void; count?: number }) {
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setComments(await getContentComments(kind, contentId)); } catch { setComments([]); } finally { setLoading(false); }
  }, [contentId, kind]);

  useEffect(() => { if (visible) load(); }, [load, visible]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const comment = await addContentComment(kind, contentId, body);
      setComments((items) => [...items, comment]);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}><Text style={styles.title}>Comments <Text style={styles.count}>{count || comments.length}</Text></Text><Pressable onPress={onClose}><X size={19} color={T.TEXT_2} /></Pressable></View>
          {loading ? <ActivityIndicator color={T.TEXT_2} style={styles.loader} /> : <FlatList data={comments} keyExtractor={(item) => item.id} renderItem={({ item }) => <CommentRow item={item} />} ListEmptyComponent={<Text style={styles.empty}>No comments yet. Start the conversation.</Text>} contentContainerStyle={styles.list} />}
          <MsComposer mode="comment" value={draft} onChangeText={setDraft} onSend={send} disabled={sending} placeholder="Add a comment…" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommentRow({ item }: { item: ContentComment }) {
  return <View style={styles.row}><MsAvatar size={32} initials={item.author.name.slice(0, 2).toUpperCase()} imageUri={item.author.avatarUrl ?? undefined} /><View style={styles.body}><Text style={styles.author}>{item.author.name}</Text><Text style={styles.comment}>{item.body}</Text></View></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { maxHeight: '86%', backgroundColor: T.SURFACE, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 12, paddingBottom: 10 },
  handle: { width: 36, height: 4, borderRadius: 4, backgroundColor: T.BORDER_2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 16 },
  count: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13 },
  loader: { marginVertical: 42 },
  list: { paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  body: { flex: 1, gap: 4 },
  author: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 12 },
  comment: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 19 },
  empty: { color: T.TEXT_2, fontFamily: T.FONT.regular, textAlign: 'center', paddingVertical: 42, paddingHorizontal: 24 },
});