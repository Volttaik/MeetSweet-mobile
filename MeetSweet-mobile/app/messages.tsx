import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Envelope, PaperPlaneTilt } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { listPrivateMessages, type PrivateMessage } from '@/services/private-inbox';
import { realtime } from '@/services/realtime';

function Item({ message, box }: { message: PrivateMessage; box: 'inbox' | 'outbox' }) {
  const name = box === 'inbox' ? message.sender_name ?? message.sender_username ?? 'User' : message.recipient_name ?? message.recipient_username ?? 'Creator';
  return <Pressable style={styles.item} onPress={() => router.push(`/inbox/${message.id}` as any)}>
    <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
    <View style={styles.content}><Text style={styles.name}>{name}</Text><Text style={styles.preview} numberOfLines={2}>{message.body}</Text><Text style={styles.meta}>₦{message.price_paid.toLocaleString()} · {message.status === 'replied' ? 'Replied' : message.status === 'read' ? 'Read' : 'Unread'}</Text></View>
    <Text style={styles.date}>{new Date(message.created_at).toLocaleDateString()}</Text>
  </Pressable>;
}

export default function MessagesScreen() {
  const [box, setBox] = useState<'inbox' | 'outbox'>('inbox');
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setMessages(await listPrivateMessages(box)); } catch {} finally { setLoading(false); setRefreshing(false); } }, [box]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => realtime.on((event) => { if (event.type === 'private_message.created' && box === 'inbox') { const message = (event.payload as any).message as PrivateMessage; setMessages((old) => old.some((m) => m.id === message.id) ? old : [message, ...old]); } if ((event.type === 'private_message.reply_created' || event.type === 'private_message.updated') && box === 'outbox') load(); }), [box, load]);
  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={() => router.back()}><ArrowLeft color={T.TEXT} /></Pressable><Text style={styles.title}>Private Messages</Text><Pressable onPress={() => router.push('/compose-private-message' as any)}><PaperPlaneTilt color={T.ACCENT} /></Pressable></View><View style={styles.tabs}><Pressable onPress={() => setBox('inbox')} style={[styles.tab, box === 'inbox' && styles.active]}><Envelope color={T.TEXT} /><Text style={styles.tabText}>Inbox</Text></Pressable><Pressable onPress={() => setBox('outbox')} style={[styles.tab, box === 'outbox' && styles.active]}><PaperPlaneTilt color={T.TEXT} /><Text style={styles.tabText}>Outbox</Text></Pressable></View><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={styles.list}>{loading ? <ActivityIndicator color={T.ACCENT} /> : messages.length ? messages.map((m) => <Item key={m.id} message={m} box={box} />) : <Text style={styles.empty}>No private correspondence yet.</Text>}</ScrollView></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: T.BG, padding: 18 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 20 }, title: { color: T.TEXT, fontSize: 20, fontFamily: T.FONT.bold }, tabs: { flexDirection: 'row', gap: 10 }, tab: { flex: 1, flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: T.SURFACE_2, justifyContent: 'center', alignItems: 'center' }, active: { backgroundColor: T.ACCENT }, tabText: { color: T.TEXT, fontFamily: T.FONT.medium }, list: { gap: 10, paddingVertical: 16 }, item: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: T.SURFACE }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: T.ACCENT, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontFamily: T.FONT.bold }, content: { flex: 1, gap: 4 }, name: { color: T.TEXT, fontFamily: T.FONT.semibold }, preview: { color: T.TEXT_2 }, meta: { color: T.TEXT_3, fontSize: 11 }, date: { color: T.TEXT_3, fontSize: 11 }, empty: { color: T.TEXT_2, textAlign: 'center', marginTop: 50 } });
