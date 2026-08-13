/**
 * Onboarding Service — Tracks completion of feature onboarding flows locally or on backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_PREFIX = '@ms_onboarded_';

export type OnboardingKey =
  | 'wallet_funded'
  | 'creator_onboarded'
  | 'withdrawal_onboarded'
  | 'subscription_onboarded'
  | 'paid_content_onboarded'
  | 'post_creation_onboarded'
  | 'shorts_onboarded';

export async function shouldShowOnboarding(key: OnboardingKey): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${ONBOARDING_PREFIX}${key}`);
    return val !== 'true';
  } catch {
    return true;
  }
}

export async function completeOnboarding(key: OnboardingKey): Promise<void> {
  try {
    await AsyncStorage.setItem(`${ONBOARDING_PREFIX}${key}`, 'true');
  } catch {}
}

export async function getOnboardingStatus(): Promise<Record<OnboardingKey, boolean>> {
  const keys: OnboardingKey[] = [
    'wallet_funded',
    'creator_onboarded',
    'withdrawal_onboarded',
    'subscription_onboarded',
    'paid_content_onboarded',
    'post_creation_onboarded',
    'shorts_onboarded',
  ];
  const result: Partial<Record<OnboardingKey, boolean>> = {};
  for (const k of keys) {
    try {
      const val = await AsyncStorage.getItem(`${ONBOARDING_PREFIX}${k}`);
      result[k] = val === 'true';
    } catch {
      result[k] = false;
    }
  }
  return result as Record<OnboardingKey, boolean>;
}
