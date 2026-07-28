/**
 * MsLongFormPlayer — long-form video using Expo's default native controls.
 *
 * Custom controls, gestures, spinners and progress bars have been removed.
 * The native player handles play/pause, scrubbing, volume and loading reliably.
 * Creator info, back button and action buttons are retained as overlay UI.
 *
 * Modes:
 *   fillContainer — fills parent (flex:1), used on full-screen video detail screens.
 *   aspectRatio   — sizes the player box by the video's aspect ratio (default).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Bookmark,
  ChatCircle,
  Heart,
  Lock,
  ShareNetwork,
  UserPlus,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
void SCREEN_WIDTH; // referenced by callers via import

/** Compact creator info shown overlaid on the video. */
export interface LongFormCreator {
  avatarUrl?: string | null;
  name: string;
  username: string;
  onSubscribePress?: () => void;
}

interface Props {
  videoId: string;
  uri: string | null;
  posterUri?: string | null;
  autoPlay?: boolean;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Eliminate initial layout flash by passing the known aspect ratio. */
  initialAspectRatio?: number;
  /** Back-button callback rendered top-left. */
  onBack?: () => void;
  /**
   * When true the player fills its parent (flex:1) instead of sizing by
   * aspect ratio. Use for full-screen video-detail screens.
   */
  fillContainer?: boolean;
  /** Show compact creator info overlaid on the video. */
  creator?: LongFormCreator;
  /** Comments-button callback — player pauses first, then calls this. */
  onCommentsPress?: () => void;
  commentCount?: number;
  onLike?: () => void;
  isLiked?: boolean;
  likeCount?: number;
  onSave?: () => void;
  isSaved?: boolean;
  onShare?: () => void;
}

export function MsLongFormPlayer({
  videoId,
  uri,
  posterUri,
  autoPlay = false,
  isPremium = false,
  onPremiumRequired,
  initialAspectRatio,
  onBack,
  fillContainer = false,
  creator,
  onCommentsPress,
  commentCount = 0,
  onLike,
  isLiked = false,
  likeCount = 0,
  onSave,
  isSaved = false,
  onShare,
}: Props) {
  const insets     = useSafeAreaInsets();
  const ref        = useRef<Video>(null);
  const premiumFired = useRef(false);

  const [error,        setError]        = useState(false);
  const [premiumGated, setPremiumGated] = useState(false);
  const [aspectRatio,  setAspectRatio]  = useState(initialAspectRatio ?? 16 / 9);

  // Stable ref keeps the premium-gated flag accessible inside the onStatus closure
  // without stale-closure issues. Always kept in sync with the state below.
  const premiumGatedRef = useRef(false);

  // Reset state when the video source changes.
  useEffect(() => {
    premiumFired.current   = false;
    premiumGatedRef.current = false;
    setPremiumGated(false);
    setError(false);
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
  }, [videoId, uri, initialAspectRatio]);

  // Track position for premium gate. Also continuously re-enforces the gate:
  // native controls can resume playback after gating, so every status tick checks
  // and immediately pauses again if the video is playing while gated.
  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      // Trigger the gate on first crossing of the 3-second mark.
      if (isPremium && !premiumFired.current && status.positionMillis >= 3000) {
        premiumFired.current    = true;
        premiumGatedRef.current = true;
        ref.current?.pauseAsync().catch(() => {});
        setPremiumGated(true);
        onPremiumRequired?.();
        return;
      }

      // Re-enforce: if gated and native controls somehow resume playback, pause again.
      if (premiumGatedRef.current && status.isPlaying) {
        ref.current?.pauseAsync().catch(() => {});
      }
    },
    [isPremium, onPremiumRequired],
  );

  const onReadyForDisplay = useCallback(
    (event: { naturalSize?: { width: number; height: number } }) => {
      const w = event.naturalSize?.width;
      const h = event.naturalSize?.height;
      if (w && h && h > 0 && !initialAspectRatio) setAspectRatio(w / h);
    },
    [initialAspectRatio],
  );

  // Pause before opening comments so the video doesn't play behind the sheet.
  const handleCommentsPress = useCallback(async () => {
    await ref.current?.pauseAsync().catch(() => {});
    onCommentsPress?.();
  }, [onCommentsPress]);

  const outerStyle = fillContainer
    ? [styles.player, styles.playerFill]
    : [styles.player, { aspectRatio }];

  const topPad = Math.max(insets.top, 0) + 10;
  const hasTopBar = !!(onBack || onLike || onCommentsPress || onSave || onShare);

  return (
    <View style={outerStyle}>
      {/* Poster thumbnail — sits behind the video */}
      {posterUri ? (
        <MsMediaLoader
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibleLabel="Video thumbnail"
        />
      ) : null}

      {/* ── Native video player ─────────────────────────────────────────── */}
      {uri && !error ? (
        <Video
          ref={ref}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay && !premiumGated}
          useNativeControls
          onPlaybackStatusUpdate={onStatus}
          onReadyForDisplay={onReadyForDisplay}
          onError={() => setError(true)}
        />
      ) : null}

      {/* Error state */}
      {(!uri || error) ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>
            {error ? 'Video could not load' : 'Video unavailable'}
          </Text>
          {error ? (
            <Pressable
              onPress={() => {
                setError(false);
                premiumFired.current = false;
                setPremiumGated(false);
              }}
              style={styles.retryBtn}
              accessibilityLabel="Retry loading video"
            >
              <ArrowCounterClockwise size={16} color={T.ACCENT} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Premium gate overlay — blocks all touches so native controls cannot resume play */}
      {premiumGated ? (
        <View style={styles.premiumOverlay}>
          <View style={styles.premiumCircle}>
            <Lock size={22} color={T.ACCENT} />
          </View>
          <Text style={styles.premiumTitle}>Premium content</Text>
          <Text style={styles.premiumSub}>Subscribe to keep watching</Text>
        </View>
      ) : null}

      {/* ── Top overlay — back button + action buttons ──────────────────── */}
      {hasTopBar ? (
        <View style={[styles.topBar, { paddingTop: topPad }]} pointerEvents="box-none">
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={styles.topBtn}
              accessibilityLabel="Go back"
              hitSlop={12}
            >
              <ArrowLeft size={18} color="#fff" weight="bold" />
            </Pressable>
          ) : <View style={styles.topBtnPlaceholder} />}

          <View style={styles.topRight}>
            {onLike ? (
              <Pressable
                onPress={onLike}
                style={styles.topBtn}
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                hitSlop={10}
              >
                <Heart
                  size={17}
                  color={isLiked ? '#EF4444' : '#fff'}
                  weight={isLiked ? 'fill' : 'regular'}
                />
                {likeCount > 0 ? (
                  <Text style={[styles.topBtnLabel, isLiked && styles.topBtnLabelLiked]}>
                    {likeCount >= 1000 ? `${(likeCount / 1000).toFixed(1)}k` : String(likeCount)}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            {onCommentsPress ? (
              <Pressable
                onPress={handleCommentsPress}
                style={styles.topBtn}
                accessibilityLabel="Comments"
                hitSlop={10}
              >
                <ChatCircle size={17} color="#fff" />
                {commentCount > 0 ? (
                  <Text style={styles.topBtnLabel}>
                    {commentCount >= 1000
                      ? `${(commentCount / 1000).toFixed(1)}k`
                      : String(commentCount)}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            {onSave ? (
              <Pressable
                onPress={onSave}
                style={styles.topBtn}
                accessibilityLabel={isSaved ? 'Unsave' : 'Save'}
                hitSlop={10}
              >
                <Bookmark
                  size={17}
                  color={isSaved ? T.ACCENT : '#fff'}
                  weight={isSaved ? 'fill' : 'regular'}
                />
              </Pressable>
            ) : null}

            {onShare ? (
              <Pressable
                onPress={onShare}
                style={styles.topBtn}
                accessibilityLabel="Share"
                hitSlop={10}
              >
                <ShareNetwork size={17} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Creator strip (bottom overlay) ─────────────────────────────── */}
      {creator ? (
        <View style={styles.creatorStrip} pointerEvents="box-none">
          {creator.avatarUrl ? (
            <Image source={{ uri: creator.avatarUrl }} style={styles.creatorAvatar} />
          ) : (
            <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
              <Text style={styles.creatorAvatarInitial}>
                {creator.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.creatorText}>
            <Text style={styles.creatorName} numberOfLines={1}>{creator.name}</Text>
            <Text style={styles.creatorHandle} numberOfLines={1}>@{creator.username}</Text>
          </View>
          {creator.onSubscribePress ? (
            <Pressable
              onPress={creator.onSubscribePress}
              style={styles.subscribeBtn}
              accessibilityLabel="Subscribe"
              hitSlop={6}
            >
              <UserPlus size={11} color={T.BG} />
              <Text style={styles.subscribeBtnText}>Subscribe</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    width: '100%',
    backgroundColor: '#050506',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: T.RADIUS.xl,
  },
  playerFill: {
    flex: 1,
    borderRadius: 0,
  },

  // ── Error state ──────────────────────────────────────────────────────────
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 4,
  },
  errorTitle: { color: '#fff', fontFamily: T.FONT.medium, fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: T.RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
  },
  retryText: { color: T.ACCENT, fontFamily: T.FONT.semibold, fontSize: 13 },

  // ── Premium gate ─────────────────────────────────────────────────────────
  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  premiumCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  premiumTitle: { color: '#fff', fontFamily: T.FONT.bold, fontSize: 16 },
  premiumSub: { color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 12 },

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 10,
  },
  topBtn: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    flexDirection: 'row',
    gap: 4,
  },
  topBtnLabel: {
    color: '#fff',
    fontFamily: T.FONT.semibold,
    fontSize: 11,
  },
  topBtnLabelLiked: { color: '#EF4444' },
  topBtnPlaceholder: { width: 38, height: 38 },
  topRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  // ── Creator strip ────────────────────────────────────────────────────────
  creatorStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,                // above native controls area
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 9,
  },
  creatorAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: T.SURFACE_2,
  },
  creatorAvatarFallback: {
    alignItems: 'center', justifyContent: 'center',
  },
  creatorAvatarInitial: {
    color: T.TEXT_2, fontFamily: T.FONT.bold, fontSize: 12,
  },
  creatorText: { flex: 1 },
  creatorName: {
    color: '#fff', fontFamily: T.FONT.semibold, fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  creatorHandle: {
    color: 'rgba(255,255,255,0.65)', fontFamily: T.FONT.regular, fontSize: 11,
  },
  subscribeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff',
    borderRadius: T.RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  subscribeBtnText: {
    color: T.BG, fontFamily: T.FONT.semibold, fontSize: 10,
  },
});
