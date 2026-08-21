/**
 * withSecureWindow — Expo config plugin: native application-wide screen
 * capture protection (Android).
 *
 * The JS-level `preventScreenCaptureAsync` (lib/screen-protection.ts) already
 * sets FLAG_SECURE on the activity window as soon as the JS bundle runs. This
 * plugin hardens the native side so protection is complete:
 *
 *  1. MainActivity.onCreate sets FLAG_SECURE on the window natively — the
 *     splash screen and the very first frames (before JS loads) are covered,
 *     and the flag is applied at the platform level, not by JS.
 *  2. `android:windowSecure` is added to the app theme.
 *  3. React Native renders `Modal` components in separate dialog windows whose
 *     theme is `Theme.FullScreenDialog` (+ AnimatedSlide/AnimatedFade) from
 *     the react-native library. Those styles are overridden with identical
 *     content plus `android:windowSecure="true"` (app resources win during
 *     AAPT2 merging), so modal sheets are protected as well.
 *
 * iOS needs no native patch — expo-screen-capture implements the capture
 * blocking (recording overlay + secure text field) and app-switcher blur
 * natively on iOS.
 */
const { withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FLAG_SECURE_IMPORT = 'import android.view.WindowManager;';
// getWindow() works in both Kotlin and Java (Kotlin: `window` is also valid,
// but getWindow() keeps a single statement for both languages).
const FLAG_SECURE_STATEMENT =
  'getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);';

/* Find MainActivity.kt / MainActivity.java under android/app/src/main/java */
function findMainActivity(androidRoot) {
  const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java');
  if (!fs.existsSync(javaDir)) return null;
  const walk = (dir) => {
    let found = null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        found = walk(full);
        if (found) return found;
      } else if (/^MainActivity\.(kt|java)$/.test(entry.name)) {
        return full;
      }
    }
    return found;
  };
  return walk(javaDir);
}

function patchMainActivity(contents) {
  if (contents.includes(FLAG_SECURE_STATEMENT)) return contents;

  // Kotlin: `super.onCreate(null)` / `super.onCreate(savedInstanceState)` on its
  // own line; Java: `super.onCreate(savedInstanceState);`. Insert the FLAG_SECURE
  // statement right after the super.onCreate call so it runs inside onCreate.
  const superCallRe = /(super\.onCreate\([^)]*\)\s*;?\s*\n)/;
  if (!superCallRe.test(contents)) {
    throw new Error('withSecureWindow: could not locate super.onCreate in MainActivity');
  }
  contents = contents.replace(
    superCallRe,
    (match) => `${match}    ${FLAG_SECURE_STATEMENT}\n`,
  );

  // Add the WindowManager import if missing. The trailing semicolon is valid in
  // both Kotlin (optional) and Java (required), so one line works for both.
  if (!contents.includes('import android.view.WindowManager')) {
    contents = contents.replace(
      /^(package [^\n]+;?\s*\n)/m,
      (m) => `${m}\n${FLAG_SECURE_IMPORT}\n`,
    );
  }
  return contents;
}

/** Add android:windowSecure to the app theme + override RN's modal dialog themes. */
function patchStyles(stylesContents) {
  const MODAL_STYLES = `
  <!-- Overrides of react-native's Modal dialog themes: identical content plus
       android:windowSecure so RN Modal sheets are protected from screenshots
       and screen recording. App resources override library resources on merge. -->
  <style name="Theme.FullScreenDialog">
    <item name="android:windowNoTitle">true</item>
    <item name="android:windowIsFloating">false</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:windowSecure">true</item>
  </style>
  <style name="Theme.FullScreenDialogAnimatedSlide" parent="Theme.FullScreenDialog">
    <item name="android:windowAnimationStyle">@style/DialogAnimationSlide</item>
  </style>
  <style name="Theme.FullScreenDialogAnimatedFade" parent="Theme.FullScreenDialog">
    <item name="android:windowAnimationStyle">@style/DialogAnimationFade</item>
  </style>
`;

  let out = stylesContents;
  if (!out.includes('Theme.FullScreenDialogAnimatedFade')) {
    out = out.replace(/<\/resources>\s*$/, `${MODAL_STYLES}\n</resources>\n`);
  }
  if (!out.includes('android:windowSecure')) {
    // Add windowSecure to the app theme (usually named AppTheme) so any window
    // themed from the app theme is secure as well.
    out = out.replace(
      /(<style name="AppTheme"[^>]*>)([\s\S]*?)(<\/style>)/,
      (_m, open, body, close) => {
        if (body.includes('android:windowSecure')) return _m;
        return `${open}${body}    <item name="android:windowSecure">true</item>\n${close}`;
      },
    );
  }
  return out;
}

module.exports = function withSecureWindow(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = path.join(cfg.modRequest.platformProjectRoot, 'android');
      const mainActivityPath = findMainActivity(androidRoot);
      if (mainActivityPath) {
        const contents = fs.readFileSync(mainActivityPath, 'utf8');
        fs.writeFileSync(mainActivityPath, patchMainActivity(contents));
      }
      return cfg;
    },
  ]);

  config = withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults;
    styles.contents = patchStyles(styles.contents);
    return cfg;
  });

  return config;
};
