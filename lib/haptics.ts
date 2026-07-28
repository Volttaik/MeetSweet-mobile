/**
 * Centralised haptic feedback utility.
 * Wraps expo-haptics so every call site has consistent feedback style.
 * Silently no-ops on web or when haptics are unavailable.
 */
import * as Haptics from 'expo-haptics';

/** Light tap — button presses, tab switches */
export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium impact — toggles, slider stops, like action */
export function tapMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Heavy impact — publish, delete, destructive confirmations */
export function tapHeavy() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Selection changed — carousels, picker scrolls */
export function tapSelection() {
  Haptics.selectionAsync().catch(() => {});
}

/** Success notification — post published, action completed */
export function notifySuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning / error notification */
export function notifyError() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
