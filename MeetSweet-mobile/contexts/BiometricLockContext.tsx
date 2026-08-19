/**
 * BiometricLockContext — device-level app lock.
 *
 * When the user enables biometric protection, the app content is covered by an
 * opaque lock screen until the OS authenticates them (Face ID / fingerprint /
 * device passcode). The gate re-arms on cold start and whenever the app returns
 * to the foreground, so backgrounding the app never leaves content visible.
 *
 * Only the OS authentication mechanism is used — no biometric data is stored.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Fingerprint } from 'phosphor-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { T } from '@/constants/theme';
import { authenticateBiometric, isBiometricEnabled } from '@/lib/biometric';

interface BiometricLockContextValue {
  locked: boolean;
  unlock: () => Promise<boolean>;
  /** Re-read the persisted biometric preference. Call after the user toggles
   *  the setting so a disable takes effect immediately (no stale prompt). */
  refreshLockState: () => Promise<void>;
}

const BiometricLockContext = createContext<BiometricLockContextValue>({
  locked: false,
  unlock: async () => true,
  refreshLockState: async () => {},
});

export function useBiometricLock(): BiometricLockContextValue {
  return useContext(BiometricLockContext);
}

function LockScreen({ onUnlock }: { onUnlock: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);

  // Auto-prompt the OS authentication once when the lock screen appears.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setBusy(true);
      await onUnlock();
      if (mounted) setBusy(false);
    })();
    return () => {
      mounted = false;
    };
    // onUnlock is stable (useCallback with no deps in the provider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setBusy(true);
    await onUnlock();
    setBusy(false);
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            tintColor="#FFFFFF"
          />
        </View>
        <Text style={styles.title}>MeetSweet is locked</Text>
        <Text style={styles.subtitle}>
          Authenticate to continue to your account.
        </Text>

        {busy ? (
          <ActivityIndicator color={T.TEXT} style={{ marginTop: 8 }} />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleRetry} activeOpacity={0.85}>
            <Fingerprint size={18} color={T.BG} weight="fill" />
            <Text style={styles.buttonLabel}>Unlock</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [locked, setLocked] = useState(false);
  const enabledRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState ?? 'active');
  // Tracks a REAL backgrounding so we only re-arm after leaving the app,
  // never on transient `inactive` transitions (see the AppState effect below).
  const wentToBackgroundRef = useRef(false);

  // Arm the lock when a session exists and biometric protection is on.
  useEffect(() => {
    if (!isAuthenticated) {
      enabledRef.current = false;
      setLocked(false);
      return;
    }
    let mounted = true;
    (async () => {
      const enabled = await isBiometricEnabled();
      if (!mounted) return;
      enabledRef.current = enabled;
      if (enabled) setLocked(true);
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  // Re-arm only after the app genuinely went to the background. The OS
  // biometric prompt (Face ID / fingerprint) takes the app through an
  // `inactive` state of its own, so treating `inactive → active` as "came
  // back" re-locks the app immediately after a successful unlock and loops
  // the prompt. Tracking `background` avoids that.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        wentToBackgroundRef.current = true;
      }
      if (
        next === 'active' &&
        wentToBackgroundRef.current &&
        enabledRef.current &&
        isAuthenticated
      ) {
        wentToBackgroundRef.current = false;
        setLocked(true);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Single authentication entry point — performs the OS auth once and unlocks.
  const unlock = useCallback(async () => {
    const ok = await authenticateBiometric('Unlock MeetSweet');
    if (ok) setLocked(false);
    return ok;
  }, []);

  // Re-read the persisted preference so a settings change (enable/disable)
  // takes effect immediately instead of waiting for the next auth change or
  // app-foreground event. Disabling clears any active lock right away.
  const refreshLockState = useCallback(async () => {
    const enabled = await isBiometricEnabled();
    enabledRef.current = enabled;
    if (!enabled) setLocked(false);
  }, []);

  return (
    <BiometricLockContext.Provider value={{ locked, unlock, refreshLockState }}>
      <View style={styles.container}>
        {children}
        {locked ? <LockScreen onUnlock={unlock} /> : null}
      </View>
    </BiometricLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 9999,
    elevation: 9999,
  },
  inner: { alignItems: 'center', gap: 14 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: T.SURFACE,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logo: { width: 40, height: 40 },

  title: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 21,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: T.TEXT,
    borderRadius: T.RADIUS.pill,
    paddingHorizontal: 28,
    height: 50,
    marginTop: 14,
  },
  buttonLabel: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
});
