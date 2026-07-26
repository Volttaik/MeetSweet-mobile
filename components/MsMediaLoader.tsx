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

interface MsMediaLoaderProps {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  blurRadius?: number;
  accessibleLabel?: string;
  errorMessage?: string;
  onRetry?: () => void;
  fallback?: React.ReactNode;
}

/**
 * Shared image lifecycle for feed, profile, premium and message media.
 * The same component owns the placeholder, fade-in and retry state everywhere.
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
}: MsMediaLoaderProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [state, setState] = useState<MediaLoadState>(uri ? 'loading' : 'error');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    opacity.setValue(0);
    setState(uri ? 'loading' : 'error');
  }, [uri, attempt, opacity]);

  const handleLoad = useCallback(() => {
    setState('success');
    Animated.timing(opacity, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
    onRetry?.();
  }, [onRetry]);

  return (
    <View style={[styles.root, style]} accessible accessibilityLabel={accessibleLabel}>
      {uri && (
        <Animated.Image
          key={`${uri}:${attempt}`}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { opacity }]}
          resizeMode={resizeMode}
          blurRadius={blurRadius}
          onLoad={handleLoad}
          onError={() => setState('error')}
        />
      )}

      {state === 'loading' && (
        <View style={styles.placeholder} accessibilityLabel="Loading media" accessibilityRole="progressbar">
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
  onRetry,
  label = 'Loading video',
}: {
  state: MediaLoadState;
  onRetry?: () => void;
  label?: string;
}) {
  if (state === 'success') return null;
  return (
    <View style={styles.stateOverlay} pointerEvents={state === 'error' ? 'auto' : 'none'}>
      {state === 'loading' ? (
        <ActivityIndicator size="large" color={T.TEXT} accessibilityLabel={label} />
      ) : (
        <>
          <WarningCircle size={28} color={T.TEXT} weight="regular" />
          <Text style={styles.errorText}>Video unavailable</Text>
          {onRetry && (
            <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
              <ArrowClockwise size={14} color={T.TEXT} weight="bold" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
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
    backgroundColor: T.SURFACE_2,
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