import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChatCircle, Heart, ShareNetwork, UserPlus } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsContentComments } from '@/components/MsContentComments';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsShareSheet } from '@/components/MsShareSheet';
import { getVideo, getVideoRecommendations, likeContent, type LongFormVideo } from '@/services/content';
import { T } from '@/constants/theme';

export default function VideoDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [video, setVideo] = useState<LongFormVideo | null>(null);
  const [recommendations, setRecommendations] = useState<LongFormVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getVideo(id), getVideoRecommendations(id)]).then(([item, next]) => {
      setVideo(item); setLiked(item.likedByMe); setRecommendations(next);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={T.TEXT_2} size="large" /></View>;
  if (!video) return <View style={styles.center}><MsEmptyState title="Video unavailable" message="This video could not be loaded from the backend." actionLabel="Go back" onAction={() => router.back()} /></View>;

  const toggleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    try { const result = await likeContent('video', video.id, liked); setVideo((current) => current ? { ...current, likeCount: result.likeCount } : current); } catch { setLiked(liked); }
  };

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}><Pressable style={styles.iconButton} onPress={() => router.back()}><ArrowLeft size={20} color={T.TEXT} /></Pressable><Text style={styles.headerTitle}>Video</Text><Pressable style={styles.iconButton} onPress={() => setShareVisible(true)}><ShareNetwork size={19} color={T.TEXT} /></Pressable></View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <MsLongFormPlayer videoId={video.id} uri={video.videoUrl} posterUri={video.thumbnailUrl} />
        <View style={styles.titleWrap}><Text style={styles.title}>{video.title || 'Untitled video'}</Text><Text style={styles.meta}>{formatCount(video.viewCount)} views · {timeAgo(video.createdAt)}</Text></View>
        <View style={styles.creatorRow}><MsAvatar size={42} initials={video.creator.name.slice(0, 2).toUpperCase()} imageUri={video.creator.avatarUrl ?? undefined} /><View style={styles.creatorCopy}><Text style={styles.creatorName}>{video.creator.name}{video.creator.isVerified ? '  ✓' : ''}</Text><Text style={styles.creatorHandle}>@{video.creator.username}</Text></View><Pressable style={styles.subscribe}><UserPlus size={14} color={T.BG} /><Text style={styles.subscribeText}>Subscribe</Text></Pressable></View>
        <View style={styles.actions}><Pressable style={styles.action} onPress={toggleLike}><Heart size={18} color={liked ? T.ACCENT : T.TEXT_2} weight={liked ? 'fill' : 'regular'} /><Text style={styles.actionText}>{formatCount(video.likeCount)}</Text></Pressable><Pressable style={styles.action} onPress={() => setCommentsVisible(true)}><ChatCircle size={18} color={T.TEXT_2} /><Text style={styles.actionText}>{formatCount(video.commentCount)}</Text></Pressable><Pressable style={styles.action} onPress={() => setShareVisible(true)}><ShareNetwork size={18} color={T.TEXT_2} /><Text style={styles.actionText}>Share</Text></Pressable></View>
        {video.description ? <Text style={styles.description}>{video.description}</Text> : null}
        <Text style={styles.sectionTitle}>Recommended videos</Text>
        {recommendations.map((item) => <Pressable key={item.id} style={styles.recommendation} onPress={() => router.push(`/videos/${item.id}`)}><View style={styles.recThumb}>{item.thumbnailUrl ? <MsMediaLoader uri={item.thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" accessibleLabel={item.title} errorMessage="" fallback={null} /> : null}</View><View style={styles.recCopy}><Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.recMeta}>{item.creator.name} · {formatCount(item.viewCount)} views</Text></View></Pressable>)}
      </ScrollView>
      <MsContentComments kind="video" contentId={video.id} visible={commentsVisible} onClose={() => setCommentsVisible(false)} count={video.commentCount} />
      <MsShareSheet visible={shareVisible} contentType="video" contentId={video.id} title={video.title || 'Video'} onClose={() => setShareVisible(false)} />
    </MsAmbientBackground>
  );
}

function formatCount(value: number) { return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value); }
function timeAgo(value: string) { if (!value) return ''; const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); return days <= 0 ? 'today' : `${days}d ago`; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: T.BG }, center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' }, header: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 15 }, iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center' }, content: { paddingBottom: 40 }, titleWrap: { padding: 18, paddingBottom: 8 }, title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 20, lineHeight: 28 }, meta: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 6 }, creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12 }, creatorCopy: { flex: 1 }, creatorName: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13 }, creatorHandle: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 2 }, subscribe: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: T.TEXT, borderRadius: T.RADIUS.full, paddingHorizontal: 13, paddingVertical: 9 }, subscribeText: { color: T.BG, fontFamily: T.FONT.semibold, fontSize: 11 }, actions: { flexDirection: 'row', gap: 22, paddingHorizontal: 18, paddingVertical: 12 }, action: { flexDirection: 'row', alignItems: 'center', gap: 5 }, actionText: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12 }, description: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 13, lineHeight: 21, paddingHorizontal: 18, paddingVertical: 12 }, sectionTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16, padding: 18, paddingBottom: 10 }, recommendation: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 8 }, recThumb: { width: 126, aspectRatio: 16 / 9, borderRadius: 9, backgroundColor: T.SURFACE_2, overflow: 'hidden' }, recCopy: { flex: 1, paddingTop: 2 }, recTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13, lineHeight: 18 }, recMeta: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 10, marginTop: 5 } });