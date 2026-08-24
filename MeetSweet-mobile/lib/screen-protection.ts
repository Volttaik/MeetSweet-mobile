/**
 * GLOBAL screen-capture protection — MeetSweet is protected application-wide.
 *
 * This is NOT per-screen protection. A single call to
 * `enableGlobalScreenProtection()` (from the root layout) keeps the native
 * capture-prevention flag active for the entire app lifetime — from launch
 * until the app is closed — so every screen (Home, Explore, Profile, Posts,
 * Shorts, Albums, Messages, Wallet, Notifications, Settings, Authentication,
 * modals, full-screen media) inherits protection automatically. No screen ever
 * calls `allowScreenCaptureAsync()`.
 *
 * Platform mechanism (native level, not a JS overlay):
 *  - Android: `preventScreenCaptureAsync` sets the real `FLAG_SECURE` window
 *    flag on the activity window. The OS blanks the window in screenshots and
 *    screen recordings; it also hides the app from the recent-apps preview.
 *    The flag lives on the window, so navigation, modals opened as stack
 *    screens, and background/foreground transitions never clear it.
 *  - iOS: Apple exposes no API to hard-block screenshots. expo-screen-capture
 *    applies the strongest protection Apple permits: while the screen is being
 *    recorded (`UIScreen.isCaptured`) a black view covers the window, and a
 *    secure text field in the window layer hierarchy makes iOS render the app
 *    blank in screenshots. `enableAppSwitcherProtectionAsync` additionally
 *    blurs the app in the app switcher / background snapshots.
 *  - Web: there is no native capture API — this is a documented no-op.
 *
 * Additional native hardening lives in the `withSecureWindow` config plugin
 * (plugins/withSecureWindow.js): Android sets FLAG_SECURE natively in
 * MainActivity.onCreate (covering the splash screen / first frames before the
 * JS bundle loads) and adds `android:windowSecure` to the dialog themes React
 * Native uses for `Modal` components, so modal sheets are protected too.
 */
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

let initialized = false;

/**
 * Activates application-wide native screen-capture protection. Safe to call
 * multiple times (only the first call does anything). Must be called once at
 * app startup, before or alongside the first navigation.
 */
export function enableGlobalScreenProtection(): void {
  if (initialized) return;
  initialized = true;

  // Android: FLAG_SECURE on the activity window. iOS: recording black-out
  // overlay + secure-text-field screenshot blanking. Idempotent on both.
  ScreenCapture.preventScreenCaptureAsync().catch(() => {});

  // iOS only: blur the app in the app switcher / background snapshots so
  // sensitive content is not visible there either.
  if (Platform.OS === 'ios') {
    ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
  }
}
