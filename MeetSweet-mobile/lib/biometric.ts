/**
 * biometric.ts — device biometric (Face ID / fingerprint) helpers.
 *
 * Only the OS's secure authentication mechanism is used (expo-local-authentication);
 * no biometric templates or fingerprints are ever stored by the app. The only
 * persisted state is a boolean preference indicating whether the app lock is on.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const BIOMETRIC_ENABLED_KEY = '@ms_biometric_enabled';

export interface BiometricSupport {
  available: boolean;   // hardware + OS support present
  enrollable: boolean;  // at least one biometric/passcode is enrolled
}

let _cachedSupport: BiometricSupport | null = null;

export async function checkBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') {
    return { available: false, enrollable: false };
  }
  if (_cachedSupport) return _cachedSupport;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      _cachedSupport = { available: false, enrollable: false };
      return _cachedSupport;
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    _cachedSupport = { available: true, enrollable: isEnrolled };
    return _cachedSupport;
  } catch {
    return { available: false, enrollable: false };
  }
}

export async function authenticateBiometric(promptMessage = 'Unlock MeetSweet'): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
  } catch {
    // Non-fatal: the lock simply won't persist across restarts.
  }
}
