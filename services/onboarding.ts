/**
 * Onboarding Service — Tracks completion of feature onboarding flows locally or on backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_PREFIX = '@ms_onboarded_';

export async function shouldShowOnboarding(key: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${ONBOARDING_PREFIX}${key}`);
    return val !== 'true';
  } catch {
    return true;
  }
}

export async function completeOnboarding(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${ONBOARDING_PREFIX}${key}`, 'true');
  } catch {}
}
