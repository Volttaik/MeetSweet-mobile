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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Fingerprint, LockKey } from 'phosphor-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { T } from '@/constants/theme';
import { authenticateBiometric, isBiometricEnabled } from '@/lib/biometric';

interface BiometricLockContextValue {
  locked: boolean;
  unlock: () => Promise<boolean>;
}

const BiometricLockContext = createContext<BiometricLockContextValue>({
  locked: false,
  unlock: async () => true,
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
          <LockKey size={34} color={T.TEXT} weight="fill" />
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

  // Re-arm whenever the app returns from the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const cameToForeground =
        (prev === 'background' || prev === 'inactive') && next === 'active';
      if (cameToForeground && enabledRef.current && isAuthenticated) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Single authentication entry point — performs the OS auth once and unlocks.
  const unlock = useCallback(async () => {
    const ok = await authenticateBiometric('Unlock MeetSweet');
    if (ok) setLocked(false);
    return ok;
  }, []);

  return (
    <BiometricLockContext.Provider value={{ locked, unlock }}>
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
