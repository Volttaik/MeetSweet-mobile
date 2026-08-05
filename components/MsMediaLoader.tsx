import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type { ImageResizeMode } from 'react-native';
import { ArrowClockwise, WarningCircle } from 'phosphor-react-native';
import { T } from '@/constants/theme';

export type MediaLoadState = 'loading' | 'success' | 'error';

/**
 * Module-level set of URIs that have been fully loaded at least once this
 * session.  Checked on every mount so already-cached images skip the
 * fade-in animation entirely and appear instantly — eliminating the
 * white-flash seen when the native image cache still holds the image but
 * the component restarts from opacity = 0.
 */
const _loadedUris = new Set<string>();

interface MsMediaLoaderProps {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  blurRadius?: number;
  accessibleLabel?: string;
  errorMessage?: string;
  onRetry?: () => void;
  fallback?: React.ReactNode;
  onLoadError?: () => void;
}

/**
 * Shared image lifecycle for feed, profile, premium and message media.
 *
 * First load  → blurred placeholder → spring fade-in to full res.
 * Repeat load → starts at full opacity immediately (no flash, no skeleton).
 */
export function MsMediaLoader({
  uri,
  style,
  resizeMode = 'cover',
  blurRadius = 0,
  accessibleLabel = 'Media',
  errorMessage = 'Could not load this media',
  onRetry,
  fallback,
  onLoadError,
}: MsMediaLoaderProps) {
  // Determine at render time whether this URI was already loaded before.
  // We use this for the initial Animated.Value so the component starts at
  // the correct opacity on the very first render.
  const alreadyCached = !!(uri && _loadedUris.has(uri));

  const opacity = useRef(new Animated.Value(alreadyCached ? 1 : 0)).current;
  const [loaded, setLoaded] = useState(alreadyCached);
  const [state, setState] = useState<MediaLoadState>(
    alreadyCached ? 'success' : uri ? 'loading' : 'error',
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uri) {
      opacity.setValue(0);
      setLoaded(false);
      setState('error');
      return;
    }
    // URI is known-good (loaded earlier in this session) and this is the first
    // attempt — skip the loading dance entirely.
    if (_loadedUris.has(uri) && attempt === 0) {
      opacity.setValue(1);
      setLoaded(true);
      setState('success');
      return;
    }
    // Fresh URI or manual retry — start from invisible and load normally.
    opacity.setValue(0);
    setLoaded(false);
    setState('loading');
  }, [uri, attempt, opacity]);

  const handleLoad = useCallback(() => {
    setState('success');
    setLoaded(true);
    // Remember this URI so future mounts are instant.
    if (uri) _loadedUris.add(uri);
    Animated.spring(opacity, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 1,
    }).start();
  }, [opacity, uri]);

  const retry = useCallback(() => {
    setAttempt((v) => v + 1);
    onRetry?.();
  }, [onRetry]);

  return (
    <View style={[styles.root, style]} accessible accessibilityLabel={accessibleLabel}>
      {/* Full-res image — starts at opacity 0 for new URIs, 1 for cached ones */}
      {uri && (
        <Animated.Image
          key={`sharp:${uri}:${attempt}`}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { opacity }]}
          resizeMode={resizeMode}
          blurRadius={blurRadius}
          onLoad={handleLoad}
          onError={() => {
            setState('error');
            onLoadError?.();
          }}
        />
      )}

      {state === 'loading' && !loaded && (
        <View
          style={styles.placeholder}
          accessibilityLabel="Loading media"
          accessibilityRole="progressbar"
        >
          <ActivityIndicator size="small" color={T.TEXT_2} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.errorState}>
          {fallback}
          <WarningCircle size={22} color={T.TEXT_2} weight="regular" />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            onPress={retry}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading media"
          >
            <ArrowClockwise size={14} color={T.TEXT} weight="bold" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Shared overlay state for video buffering/loading and playback errors. */
export function MsMediaState({
  state,
  errorMessage = 'Could not play this video',
  onRetry,
}: {
  state: MediaLoadState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  if (state === 'loading') {
    return (
      <View style={styles.stateOverlay} pointerEvents="none">
        <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={styles.stateOverlay}>
        <WarningCircle size={32} color="rgba(255,255,255,0.6)" />
        <Text style={[styles.errorText, { color: 'rgba(255,255,255,0.7)' }]}>{errorMessage}</Text>
        {onRetry && (
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <ArrowClockwise size={14} color="#fff" weight="bold" />
            <Text style={[styles.retryText, { color: '#fff' }]}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: T.SURFACE_2,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  errorState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: T.SURFACE_2,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  errorText: {
    color: T.TEXT_2,
    fontFamily: T.FONT.regular,
    fontSize: 12,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: T.RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryText: {
    color: T.TEXT,
    fontFamily: T.FONT.semibold,
    fontSize: 12,
  },
});
