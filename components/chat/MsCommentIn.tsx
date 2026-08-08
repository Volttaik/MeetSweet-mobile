/**
 * MsCommentIn — reusable Comment Room entrance animation.
 *
 * Implements the Comment Room "feels integrated into the post experience"
 * requirement: new comments animate in with a lightweight, springy entrance
 * (fade + slide-up + scale). This is a reusable component so every Comment
 * Room surface (post detail, content sheet) animates consistently.
 *
 * Serverless philosophy: this is a LOCAL entrance animation only — no typing
 * indicators, presence, or live cursors. The design images for the final
 * Comment Room layout are pending; this component preserves the existing
 * design system (T theme tokens) and can be restyled when they arrive.
 *
 * Usage:
 *   <MsCommentIn animateOnMount={key}>
 *     <CommentRow ... />
 *   </MsCommentIn>
 *
 * Pass a changing `animateOnMount` (e.g. the comment id) to replay the
 * animation for each newly-added comment.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';
import { T } from '@/constants/theme';

interface MsCommentInProps {
  children: React.ReactNode;
  /** Changing this value (e.g. a new comment id) replays the entrance. */
  animateOnMount?: string | number | null;
  /** Set false to skip animation (e.g. initial page load). */
  enabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function MsCommentIn({
  children,
  animateOnMount,
  enabled = true,
  style,
}: MsCommentInProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start();
  }, [animateOnMount, enabled, progress]);

  if (!enabled) {
    return <View style={style}>{children}</View>;
  }

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * MsCommentFade — soft fade-in used when a comment is edited in place,
 * preserving design consistency (same easing curve as MsCommentIn).
 */
export function MsCommentFade({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** Design-token accent used by the animation (kept in sync with the theme). */
export const commentAccent = T.ACCENT;
