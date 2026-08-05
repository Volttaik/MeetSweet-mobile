import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChatCircle, Clock, Heart, ShareNetwork } from 'phosphor-react-native';
import { MsTierBadge } from '@/components/MsTierBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsAvatar } from '@/components/MsAvatar';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { useVideoFeed, type LongFormVideo } from '@/services/content';
import { T } from '@/constants/theme';

export default function VideosFeedScreen() {
  const insets = useSafeAreaInsets();
  const query = useVideoFeed();
  const [refreshing, setRefreshing] = useState(false);
  const videos = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.items) ?? []).filter((video) => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    });
  }, [query.data]);

  const refresh = async () => {
    setRefreshing(true);
    try { await query.refetch(); } finally { setRefreshing(false); }
  };

  return (
    <MsAmbientBackground style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={20} color={T.TEXT} /></Pressable>
        <View style={styles.heading}><Text style={styles.eyebrow}>LONG-FORM</Text><Text style={styles.title}>Videos</Text></View>
        <Pressable style={styles.shortsButton} onPress={() => router.push('/shorts')}><Text style={styles.shortsLabel}>Shorts</Text></Pressable>
      </View>
      {query.isLoading ? (
        <View style={{ marginTop: 8 }}>
          <MsPostSkeleton />
          <MsPostSkeleton />
          <MsPostSkeleton />
        </View>
      ) : query.isError ? (
        <MsEmptyState title="Videos unavailable" message="The long-form video service could not be reached." actionLabel="Try again" onAction={() => query.refetch()} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <VideoCard video={item} />}
          ListHeaderComponent={<View style={styles.intro}><Text style={styles.introTitle}>Watch comfortably</Text><Text style={styles.introCopy}>Long-form creator videos, with comments and recommendations built in.</Text></View>}
          ListEmptyComponent={<MsEmptyState title="No videos yet" message="Long-form videos from creators will appear here." />}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.45}
          ListFooterComponent={query.isFetchingNextPage ? <View style={styles.footer}><MsPostSkeleton /></View> : null}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.TEXT} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={5}
        />
      )}
    </MsAmbientBackground>
  );
}

function VideoCard({ video }: { video: LongFormVideo }) {
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/videos/${video.id}`)} accessibilityRole="button" accessibilityLabel={`Open ${video.title}`}>
      <View style={styles.thumbnail}>
        {video.thumbnailUrl ? <MsMediaLoader uri={video.thumbnailUrl} style={StyleSheet.absoluteFill} resizeMode="cover" accessibleLabel={`${video.title} thumbnail`} errorMessage="" fallback={null} /> : null}
        <View style={styles.duration}><Clock size={11} color="#fff" /><Text style={styles.durationText}>{formatDuration(video.durationSecs)}</Text></View>
        {video.tier && video.tier !== 'free' ? <View style={styles.premiumWrap}><MsTierBadge tier={video.tier} size="xs" /></View> : null}
      </View>
      <View style={styles.cardBody}>
        <MsAvatar size={38} initials={video.creator.name.slice(0, 2).toUpperCase()} imageUri={video.creator.avatarUrl ?? undefined} />
        <View style={styles.cardCopy}><Text style={styles.videoTitle} numberOfLines={2}>{video.title || 'Untitled video'}</Text><Text style={styles.creator}>{video.creator.name}{video.creator.isVerified ? '  ✓' : ''} · {formatCount(video.viewCount)} views</Text><View style={styles.stats}><Text style={styles.stat}><Heart size={11} color={T.TEXT_3} /> {formatCount(video.likeCount)}</Text><Text style={styles.stat}><ChatCircle size={11} color={T.TEXT_3} /> {formatCount(video.commentCount)}</Text><Text style={styles.stat}><ShareNetwork size={11} color={T.TEXT_3} /> {formatCount(video.shareCount)}</Text><Text style={styles.stat}>{timeAgo(video.createdAt)}</Text></View></View>
      </View>
      {video.commentsPreview.length > 0 ? <View style={styles.commentPreview}><Text style={styles.commentLabel}>COMMENTS</Text>{video.commentsPreview.slice(0, 2).map((comment) => <Text key={comment.id} style={styles.commentLine} numberOfLines={1}><Text style={styles.commentAuthor}>{comment.author.name}: </Text>{comment.body}</Text>)}</View> : null}
    </Pressable>
  );
}

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function formatCount(value: number) { return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value); }
function timeAgo(value: string) { if (!value) return ''; const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); return days <= 0 ? 'today' : `${days}d ago`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  header: { minHeight: 70, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1 }, eyebrow: { color: T.TEXT_3, fontFamily: T.FONT.semibold, letterSpacing: 1.4, fontSize: 9 }, title: { color: T.TEXT, fontFamily: T.FONT.bold, fontSize: 26, marginTop: 2 },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.SURFACE, alignItems: 'center', justifyContent: 'center' },
  shortsButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: T.RADIUS.full, backgroundColor: T.ACCENT_LIGHT }, shortsLabel: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, intro: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 }, introTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 }, introCopy: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 12, marginTop: 4 },
  list: { paddingBottom: 36 }, card: { backgroundColor: T.SURFACE, borderRadius: T.RADIUS.xl, overflow: 'hidden', marginHorizontal: 12, marginBottom: 16, ...T.SHADOWS.medium }, thumbnail: { aspectRatio: 16 / 9, backgroundColor: T.SURFACE_2 }, duration: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4 }, durationText: { color: '#fff', fontFamily: T.FONT.semibold, fontSize: 10 }, premiumWrap: { position: 'absolute', top: 10, left: 10 },
  cardBody: { flexDirection: 'row', gap: 10, padding: 14 }, cardCopy: { flex: 1, gap: 4 }, videoTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 14, lineHeight: 20 }, creator: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11 }, stats: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 2 }, stat: { color: T.TEXT_3, fontFamily: T.FONT.regular, fontSize: 10, flexDirection: 'row', alignItems: 'center' },
  commentPreview: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 }, commentLabel: { color: T.TEXT_3, fontFamily: T.FONT.semibold, fontSize: 9, letterSpacing: 1 }, commentLine: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 11, marginTop: 6 }, commentAuthor: { color: T.TEXT, fontFamily: T.FONT.semibold }, footer: { paddingVertical: 18 },
});