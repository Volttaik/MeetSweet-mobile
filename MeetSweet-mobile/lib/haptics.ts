/**
 * Centralised haptic feedback utility.
 * Wraps expo-haptics so every call site has consistent feedback style.
 * Silently no-ops on web or when haptics are unavailable.
 *
 * Vibrations are user-controllable: the preference is persisted on the device
 * (`@ms_haptics_enabled`) and every call site in the app is gated through it.
 * On the FIRST haptic experience (before the user has chosen), a prompt is
 * emitted so the UI can ask whether to keep vibrations on.
 */
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAPTICS_KEY = '@ms_haptics_enabled';

/** true/false once decided; null = the user hasn't chosen yet (first run). */
let enabled: boolean | null = null;
let loadPromise: Promise<boolean> | null = null;

/** Load the persisted preference once (idempotent; cached in memory). */
export function loadHapticsPreference(): Promise<boolean> {
  if (enabled !== null) return Promise.resolve(enabled);
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(HAPTICS_KEY)
      .then((v) => {
        // Absent key → null → undecided (defaults to ON until the user picks).
        enabled = v === '0' ? false : v === '1' ? true : null;
        return enabled !== false;
      })
      .catch(() => {
        enabled = null;
        return true;
      });
  }
  return loadPromise;
}

/** Current effective state — treats an undecided user as enabled. */
export function isHapticsEnabled(): boolean {
  return enabled !== false;
}

/** Persist the user's choice and apply it immediately for this session. */
export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value;
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, value ? '1' : '0');
  } catch {
    // Non-fatal — the in-memory flag still applies for this session.
  }
}

// ─── First-haptics prompt ─────────────────────────────────────────────────────

type PromptListener = () => void;
const promptListeners = new Set<PromptListener>();
let promptPending = false;

/**
 * Subscribe to the "first haptic experience" signal. The root layout uses this
 * to show a small modal asking whether to keep vibrations on. Returns an
 * unsubscribe function.
 */
export function onHapticsPromptNeeded(listener: PromptListener): () => void {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}

/** Resolve the prompt (enable/disable) and persist the choice. */
export function resolveHapticsPrompt(value: boolean): Promise<void> {
  promptPending = false;
  return setHapticsEnabled(value);
}

/** Fire the prompt exactly once per session when the first haptic is about to play. */
function requestPromptIfNeeded(): void {
  if (enabled !== null || promptPending) return;
  promptPending = true;
  promptListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A broken listener must never break the haptic call site.
    }
  });
}

/** Gate: run the prompt logic, then decide whether to actually vibrate. */
function shouldFire(): boolean {
  requestPromptIfNeeded();
  return enabled !== false;
}

/** Light tap — button presses, tab switches */
export function tapLight() {
  if (!shouldFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium impact — toggles, slider stops, like action */
export function tapMedium() {
  if (!shouldFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Heavy impact — publish, delete, destructive confirmations */
export function tapHeavy() {
  if (!shouldFire()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Selection changed — carousels, picker scrolls */
export function tapSelection() {
  if (!shouldFire()) return;
  Haptics.selectionAsync().catch(() => {});
}

/** Success notification — post published, action completed */
export function notifySuccess() {
  if (!shouldFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning / error notification */
export function notifyError() {
  if (!shouldFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
