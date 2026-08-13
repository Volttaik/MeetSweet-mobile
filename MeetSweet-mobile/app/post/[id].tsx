import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
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
import {
  MsCommentRoomPanel,
  postContentTranslateY,
  postContentScaleY,
  postContentOpacity,
} from '@/components/chat/MsCommentRoomPanel';
import { useAuth } from '@/contexts/AuthContext';
import { getPost, reportPost, type Post } from '@/services/posts';
import { getCommentRoom } from '@/services/comment-room-service';

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [commentRoomId, setCommentRoomId] = useState<string | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Shared Comment Room panel progress (0 = closed, 1 = open). The panel
  // animates this value; the post content below applies the SAME value so
  // opening the room pushes the post upward + reduces its visible height,
  // and closing expands it back (POST ↓ COMMENTS).
  const commentProgress = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const postResult = await getPost(id);
      setPost(postResult);
      // Comment Room identity comes from POST DATA — never guessed client-side.
      const roomId = postResult.commentRoomId ?? null;
      setCommentRoomId(roomId);
      if (roomId) {
        const roomResult = await getCommentRoom(roomId);
        setCommentsEnabled(roomResult.commentsEnabled);
      } else {
        setCommentsEnabled(true);
      }
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
          onPress={() => Alert.alert('Report post', 'Choose a reason.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Inappropriate', onPress: () => reportPost(post.id).catch(() => Alert.alert('Could not report post', 'Please try again.')) },
            { text: 'Something else', onPress: () => reportPost(post.id, 'other').catch(() => Alert.alert('Could not report post', 'Please try again.')) },
          ])}
          accessibilityLabel="Report post"
        >
          <DotsThree size={22} color={T.TEXT_2} />
        </Pressable>
      </View>

      {/* Post content — pushed upward + reduced when the Comment Room opens. */}
      <Animated.View
        style={[
          styles.postContentWrap,
          {
            transform: [
              { translateY: postContentTranslateY(commentProgress) },
              { scaleY: postContentScaleY(commentProgress) },
            ],
            opacity: postContentOpacity(commentProgress),
          },
        ]}
      >
        <MsPostCard
          post={post}
          currentUserId={user?.id}
          onAuthorPress={() => router.push(`/creator/${post.author.username}`)}
        />
      </Animated.View>

      {/* Comment Room panel — part of the post experience (POST ↓ COMMENTS).
          Comments OFF = submission unavailable here AND backend enforces it;
          the Comment Room stays associated so it can be re-enabled later. */}
      <MsCommentRoomPanel
        postId={post.id}
        commentRoomId={commentRoomId}
        commentsEnabled={commentsEnabled}
        totalCount={post.commentCount}
        progress={commentProgress}
        onClose={() => setCommentsEnabled((v) => v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.BG },
  center: { flex: 1, backgroundColor: T.BG, alignItems: 'center', justifyContent: 'center' },
  muted: { color: T.TEXT_2, fontFamily: T.FONT.regular, fontSize: 14 },
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
  postContentWrap: {
    flexShrink: 1,
  },
  commentBody: { flex: 1 },
  commentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentAuthor: { color: T.TEXT, fontFamily: T.FONT.semibold, fontSize: 13 },
  commentText: { color: T.TEXT, fontFamily: T.FONT.regular, fontSize: 14, lineHeight: 21, marginTop: 4 },
  replyAction: { color: T.TEXT_2, fontFamily: T.FONT.medium, fontSize: 12, marginTop: 8 },
  emptyComments: { alignItems: 'center', gap: 8, paddingVertical: 36 },
});