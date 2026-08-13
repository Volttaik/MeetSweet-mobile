/**
 * Share-link resolver screen  /s/:token
 *
 * When someone taps a MeetSweet share link (e.g. https://meetsweet.space/s/abc123)
 * and the app is installed, Expo Router deep-links here.
 * We resolve the token → content_type + content_id → navigate to the right screen.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { resolveShareLink } from '@/services/sharing';
import { T } from '@/constants/theme';

export default function ShareTokenResolver() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      router.replace('/(tabs)');
      return;
    }

    let cancelled = false;

    resolveShareLink(token as string)
      .then((result) => {
        if (cancelled) return;
        if (!result) throw new Error('Not found');

        const contentType = result.content_type || result.target_type || result.type || 'post';
        const contentId = result.content_id || result.target_id || result.id || token;

        if (!contentId) throw new Error('Missing content ID');

        switch (contentType) {
          case 'video':
            router.replace(`/videos/${contentId}`);
            break;
          case 'short':
            router.replace({ pathname: '/shorts', params: { startId: contentId } });
            break;
          case 'album':
            router.replace(`/album/${contentId}`);
            break;
          case 'creator':
            router.replace(`/creator/${contentId}`);
            break;
          case 'post':
          default:
            router.replace(`/post/${contentId}`);
            break;
        }
      })
      .catch(() => {
        if (cancelled) return;
        const str = String(token);
        if (str.startsWith('post_')) {
          router.replace(`/post/${str}`);
          return;
        }
        if (str.startsWith('creator_') || str.startsWith('@')) {
          router.replace(`/creator/${str.replace(/^@/, '')}`);
          return;
        }
        if (str.startsWith('album_')) {
          router.replace(`/album/${str}`);
          return;
        }
        if (str.startsWith('video_')) {
          router.replace(`/videos/${str}`);
          return;
        }
        if (str.startsWith('short_')) {
          router.replace({ pathname: '/shorts', params: { startId: str } });
          return;
        }

        setError('This link could not be opened or is no longer available.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.homeBtnText}>Go to Home Feed</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ActivityIndicator color={T.ACCENT} size="large" />
          <Text style={styles.text}>Opening content…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 15,
    marginTop: 16,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 18,
  },
  error: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  homeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  homeBtnText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 14,
  },
});
