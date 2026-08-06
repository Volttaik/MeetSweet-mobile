/**
 * Share-link resolver screen  /s/:token
 *
 * When someone taps a MeetSweet share link (e.g. https://meetsweet-server.quizmi.space/s/abc123)
 * and the app is installed, Expo Router deep-links here.
 * We resolve the token → content_type + content_id → navigate to the right screen.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

        const { content_type, content_id } = result;

        switch (content_type) {
          case 'video':
            router.replace(`/videos/${content_id}`);
            break;
          case 'short':
            router.replace({ pathname: '/shorts', params: { startId: content_id } });
            break;
          case 'album':
            router.replace(`/album/${content_id}`);
            break;
          case 'creator':
            router.replace(`/creator/${content_id}`);
            break;
          case 'post':
          default:
            router.replace(`/post/${content_id}`);
            break;
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('This link has expired or is no longer available.');
        // Bounce to home after 2.5 s
        setTimeout(() => {
          if (!cancelled) router.replace('/(tabs)');
        }, 2500);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator color={T.ACCENT} size="large" />
          <Text style={styles.text}>Opening…</Text>
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
    gap: 16,
  },
  text: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 15,
  },
  error: {
    color: T.TEXT_2,
    fontFamily: T.FONT.medium,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
