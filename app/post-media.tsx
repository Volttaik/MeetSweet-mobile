/**
 * Post Full View — pure media viewer.
 *
 * Opens when a user taps media inside a post card.
 * Shows ONLY the media + a back button. No comments, likes, creator panel,
 * recommendations or metadata — just the image or video.
 *
 * For videos: uses MsLongFormPlayer in fillContainer mode.
 * For images: full-screen Image with pinch-zoom feel via resizeMode contain.
 *
 * Route params:
 *   uri         — media URL (required)
 *   type        — 'image' | 'video'
 *   postId      — used as videoId key for progress save
 *   aspectRatio — optional "width/height" float string
 */
import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { MsLongFormPlayer } from '@/components/MsLongFormPlayer';
import { T } from '@/constants/theme';

export default function PostMediaScreen() {
  const { uri, type, postId, aspectRatio } =
    useLocalSearchParams<{
      uri: string;
      type: 'image' | 'video';
      postId: string;
      aspectRatio?: string;
    }>();

  const insets = useSafeAreaInsets();

  const parsedAspectRatio = aspectRatio ? parseFloat(aspectRatio) : undefined;
  const safePostId = postId ?? 'post-media';

  return (
    <View style={styles.screen}>
      {type === 'video' ? (
        /* ── Video: full-screen player with back button ─────────────────── */
        <MsLongFormPlayer
          videoId={safePostId}
          uri={uri ?? null}
          autoPlay
          fillContainer
          initialAspectRatio={parsedAspectRatio}
          onBack={() => router.back()}
        />
      ) : (
        /* ── Image: full-screen contain ─────────────────────────────────── */
        <>
          {/* Back button — overlaid top-left */}
          <Pressable
            style={[styles.backBtn, { top: insets.top + 12 }]}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <ArrowLeft size={19} color="#fff" weight="bold" />
          </Pressable>

          <Image
            source={{ uri: uri ?? '' }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Post image"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050506',
  },

  // Image viewer
  image: {
    flex: 1,
    width: '100%',
  },

  // Back button for image mode (video mode uses the player's built-in back)
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
