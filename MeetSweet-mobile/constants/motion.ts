/**
 * Shared motion constants for the video experience.
 *
 * Every fade / scale / slide animation across MsVideoPlayer, MsShortsPlayer,
 * feed previews, related-video cards and the comments panel should pull its
 * timing from here so the whole app moves with one consistent feel.
 */
import { Easing } from 'react-native-reanimated';

export const MOTION = {
  // Fade durations (ms) — used for opacity-only transitions.
  FADE_IN: 200,
  FADE_OUT: 220,

  // Control / overlay transitions.
  CONTROL_SHOW: 180,
  CONTROL_HIDE: 260,

  // Press feedback.
  PRESS_DOWN: 90,
  PRESS_UP: 180,
  PRESS_SCALE: 0.94,

  // Popups / panels (orientation picker, comments sheet).
  PANEL_IN: 220,
  PANEL_OUT: 180,

  EASE_STANDARD: Easing.out(Easing.cubic),
  EASE_ENTER: Easing.out(Easing.ease),
  EASE_EXIT: Easing.in(Easing.ease),
} as const;
