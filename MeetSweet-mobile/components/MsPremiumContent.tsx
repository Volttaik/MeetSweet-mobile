/**
 * MsPremiumContent — subscriber-only media overlay for feed, posts, and messages.
 * Shows blurred media behind a "Subscribers Only" gate. Tapping the CTA calls
 * onSubscribe (typically navigates to the creator profile to subscribe).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MsVideoPlayer } from '@/components/MsVideoPlayer';
import { MsVideoPreview } from '@/components/MsVideoPreview';
import { LockSimple, Play } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsMediaLoader } from '@/components/MsMediaLoader';
import { MsVideoThumbnail } from '@/components/MsVideoThumbnail';

export interface MsPremiumContentProps {
  uri?: string | null;
  posterUri?: string | null;
  videoThumbnailUri?: string | null;
  mediaType?: 'image' | 'video';
  locked?: boolean;
  unlocked?: boolean;
  previewSeconds?: number;
  /** Called when the user taps the "Subscribe" CTA. */
  onSubscribe?: () => void;
  height?: number;
  aspectRatio?: number;
  borderRadius?: number;
  style?: ViewStyle;
  overlayOnly?: boolean;
  onPlayPress?: () => void;
  previewMode?: boolean;
  active?: boolean;
}

export function MsPremiumContent({
  uri,
  posterUri,
  videoThumbnailUri,
  mediaType = 'image',
  locked = false,
  unlocked = false,
  previewSeconds = 2,
  onSubscribe,
  height = 240,
  aspectRatio,
  borderRadius = T.RADIUS.lg,
  style,
  overlayOnly = false,
  onPlayPress,
  previewMode = false,
  active = true,
}: MsPremiumContentProps) {
  const [videoStarted, setVideoStarted] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    setVideoStarted(false);
    overlayOpacity.setValue(1);
  }, [uri, locked, mediaType]);

  useEffect(() => {
    if (locked && !unlocked) {
      Animated.spring(btnScale, {
        toValue: 1,
        damping: 12,
        stiffness: 280,
        mass: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [locked, unlocked]);

  const isLocked = !unlocked && locked;

  if (unlocked && overlayOnly) return null;

  return (
    <View
      style={[
        styles.container,
        { height: aspectRatio ? undefined : height, borderRadius },
        aspectRatio ? { aspectRatio } : undefined,
        style,
      ]}
    >
      {/* Image */}
      {!overlayOnly && uri && mediaType === 'image' && (
        <MsMediaLoader
          uri={uri}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={isLocked ? 18 : 0}
          accessibleLabel="Post image"
        />
      )}

      {/* Video — feed preview */}
      {!overlayOnly && uri && mediaType === 'video' && previewMode && !isLocked && (
        <MsVideoPreview
          uri={uri}
          posterUri={posterUri ?? videoThumbnailUri ?? null}
          active={active}
        />
      )}

      {/* Video — standard mode */}
      {!overlayOnly && uri && mediaType === 'video' && !previewMode && (
        <>
          {!videoStarted && (
            posterUri ? (
              <MsMediaLoader
                uri={posterUri}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibleLabel="Video poster"
              />
            ) : videoThumbnailUri ? (
              <MsVideoThumbnail
                videoUri={videoThumbnailUri}
                style={StyleSheet.absoluteFill}
                visible
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoPosterFallback]} />
            )
          )}
          {videoStarted && (
            <View style={StyleSheet.absoluteFill}>
              <MsVideoPlayer
                videoId={uri}
                uri={uri}
                autoPlay
                fillContainer
                mode="standard"
              />
            </View>
          )}
          {!isLocked && !videoStarted && (
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => {
                if (onPlayPress) {
                  onPlayPress();
                } else {
                  setVideoStarted(true);
                }
              }}
              activeOpacity={0.82}
            >
              <Play size={22} color={T.TEXT} weight="fill" />
            </TouchableOpacity>
          )}
        </>
      )}

      {!uri && !overlayOnly && <View style={styles.emptyMedia} />}

      {/* Subscriber-only lock overlay */}
      {isLocked && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
          <View style={styles.scrimTop} />
          <View style={styles.scrimBottom} />

          <View style={styles.lockContent}>
            <View style={styles.lockIcon}>
              <LockSimple size={16} color={T.TEXT} weight="bold" />
            </View>

            <Text style={styles.lockTitle}>Subscribers Only</Text>

            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                onPress={onSubscribe}
                style={styles.unlockBtn}
                activeOpacity={0.82}
              >
                <Play size={11} color={T.BG} weight="fill" />
                <Text style={styles.unlockLabel}>Subscribe</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', backgroundColor: T.SURFACE },
  emptyMedia: { ...StyleSheet.absoluteFillObject, backgroundColor: T.SURFACE_2 },

  playButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  videoPosterFallback: { backgroundColor: T.SURFACE_2 },

  // Gradient scrim — top dark fade + bottom stronger dark
  scrimTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,6,12,0.52)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(8,6,12,0.38)',
  },

  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  lockIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockTitle: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 34,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
  },
  unlockLabel: {
    color: T.BG,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
});
