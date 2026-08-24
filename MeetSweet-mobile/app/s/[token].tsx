/**
 * Share-link resolver screen  /s/:token
 *
 * When someone taps a MeetSweet share link (e.g. https://meetsweet.space/s/abc123)
 * and the app is installed, Expo Router deep-links here.
 * We resolve the token → content_type + content_id → navigate to the right screen.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { router, useLocalSearchParams } from 'expo-router';
import { resolveShareLink } from '@/services/sharing';
import { useAuth } from '@/contexts/AuthContext';
import {
  routeToShareDestination,
  setPendingShareDestination,
  type ShareDestination,
} from '@/lib/deep-link';
import { T } from '@/constants/theme';

export default function ShareTokenResolver() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    // Wait for the session state — the resolver must know whether the viewer
    // is signed in before deciding what to do with the destination.
    if (isLoading) return;

    if (!token) {
      router.replace('/(tabs)');
      return;
    }

    let cancelled = false;

    const go = (destination: ShareDestination) => {
      // A logged-out recipient should still land on the shared content right
      // away (the destination screens support anonymous viewing), but the
      // destination is remembered so a later login returns here instead of
      // onboarding — the shared link is never lost.
      if (!isAuthenticated) {
        setPendingShareDestination(destination);
      }
      routeToShareDestination(destination, 'replace');
    };

    resolveShareLink(token as string)
      .then((result) => {
        if (cancelled) return;
        if (!result) throw new Error('Not found');

        const contentType = result.content_type || result.target_type || result.type || 'post';
        const contentId = result.content_id || result.target_id || result.id || token;

        if (!contentId) throw new Error('Missing content ID');

        const type =
          contentType === 'video' || contentType === 'short' || contentType === 'album' || contentType === 'creator'
            ? contentType
            : 'post';
        go({ type, id: contentId });
      })
      .catch(() => {
        if (cancelled) return;
        const str = String(token);
        // Legacy fallback: some older shared links carry the id itself.
        if (str.startsWith('post_')) {
          go({ type: 'post', id: str });
          return;
        }
        if (str.startsWith('creator_') || str.startsWith('@')) {
          go({ type: 'creator', id: str.replace(/^@/, '') });
          return;
        }
        if (str.startsWith('album_')) {
          go({ type: 'album', id: str });
          return;
        }
        if (str.startsWith('video_')) {
          go({ type: 'video', id: str });
          return;
        }
        if (str.startsWith('short_')) {
          go({ type: 'short', id: str });
          return;
        }

        setError('This link could not be opened or is no longer available.');
      });

    return () => {
      cancelled = true;
    };
  }, [token, isLoading, isAuthenticated]);

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
          <MsPressable
            style={styles.homeBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.homeBtnText}>Go to Home Feed</Text>
          </MsPressable>
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
