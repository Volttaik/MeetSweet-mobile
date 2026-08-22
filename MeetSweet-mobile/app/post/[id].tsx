import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, DotsThree } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsEmptyState } from '@/components/MsEmptyState';
import { MsPostCard } from '@/components/MsPostCard';
import { MsPostSkeleton } from '@/components/MsSkeletonCard';
import { CommentsModal } from '@/components/MsCommentsSheet';
import { useAuth } from '@/contexts/AuthContext';
import { dialogs } from '@/components/MsGlobalDialogs';
import { getPost, reportPost, type Post } from '@/services/posts';

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const postResult = await getPost(id);
      setPost(postResult);
      setError('');
    } catch {
      setError('This post is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={[styles.header, { paddingTop: 8 }]}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <ArrowLeft size={20} color={T.TEXT} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.iconButton} />
        </View>
        <MsPostSkeleton />
        <MsPostSkeleton />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <MsEmptyState title="Post unavailable" message={error} actionLabel="Go back" onAction={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={20} color={T.TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <Pressable
          style={styles.iconButton}
          onPress={() => dialogs.options({
            title: 'Report post',
            actions: [
              { label: 'Inappropriate', onPress: () => reportPost(post.id).catch(() => dialogs.alert({ variant: 'error', title: 'Could not report post', message: 'Please try again.' })) },
              { label: 'Something else', onPress: () => reportPost(post.id, 'other').catch(() => dialogs.alert({ variant: 'error', title: 'Could not report post', message: 'Please try again.' })) },
            ],
          })}
          accessibilityLabel="Report post"
        >
          <DotsThree size={22} color={T.TEXT_2} />
        </Pressable>
      </View>

      {/* Post content — scrollable so long captions / tall media are fully
          reachable, and the media opens the same fullscreen viewer the feed
          uses (image → /post-media, video → /videos/:id). Comments open as the
          same bottom sheet used by Shorts/Video, with swipe-down dismissal. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <MsPostCard
          post={post}
          currentUserId={user?.id}
          onAuthorPress={() => router.push(`/creator/${post.author.username}`)}
          onCommentsPress={() => setCommentsVisible(true)}
          onMediaPress={() => {
            if (post.mediaType === 'video') {
              router.push(`/videos/${post.id}`);
            } else if (post.mediaUrl) {
              router.push({
                pathname: '/post-media',
                params: {
                  uri: post.mediaUrl,
                  type: 'image',
                  postId: post.id,
                  aspectRatio: post.width && post.height ? String(post.width / post.height) : '',
                },
              });
            }
          }}
        />
      </ScrollView>

      {/* Comments — the shared Shorts/Video comment sheet (layout, scrolling,
          keyboard behaviour, swipe-down dismissal, input, rendering). */}
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={post.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitle: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 16 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: T.RADIUS.full,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
