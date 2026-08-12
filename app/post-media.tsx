/**
 * Post Full View — image-only full-screen viewer.
 *
 * Opens when a user taps an image inside a post card.
 * Shows ONLY the image + a back button.
 *
 * Videos are no longer routed here — they go to /videos/[id] instead,
 * where the native Expo player handles playback and fullscreen.
 *
 * Route params:
 *   uri         — image URL (required)
 *   type        — should be 'image'; 'video' redirects to /videos/[postId]
 *   postId      — post identifier
 *   aspectRatio — ignored for images (kept for back-compat)
 */
import React, { useEffect } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export default function PostMediaScreen() {
  const { uri, type, postId } =
    useLocalSearchParams<{
      uri: string;
      type: 'image' | 'video';
      postId: string;
      aspectRatio?: string;
    }>();

  const insets = useSafeAreaInsets();

  // Any video that still lands here gets redirected to the watch page.
  useEffect(() => {
    if (type === 'video' && postId) {
      router.replace(`/videos/${postId}`);
    }
  }, [type, postId]);

  // While the redirect is pending (or if there's no postId), show nothing.
  if (type === 'video') return null;

  return (
    <View style={styles.screen}>
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
