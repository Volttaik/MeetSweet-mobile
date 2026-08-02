/**
 * onboarding.ts — Tracks which onboarding flows have been completed.
 * Uses AsyncStorage for persistence.
 * 
 * Onboarding flows:
 * - wallet_funded: First-time user completes wallet funding
 * - creator_onboarded: Creator completes dashboard onboarding
 * - withdrawal_onboarded: Creator completes withdrawal onboarding
 * - subscription_onboarded: User completes first subscription
 * - paid_content_onboarded: User unlocks first paid content
 * - post_creation_onboarded: Creator creates first post
 * - shorts_onboarded: User views Shorts for first time
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  wallet_funded: '@ms_onboard_wallet_funded',
  creator_onboarded: '@ms_onboard_creator',
  withdrawal_onboarded: '@ms_onboard_withdrawal',
  subscription_onboarded: '@ms_onboard_subscription',
  paid_content_onboarded: '@ms_onboard_paid_content',
  post_creation_onboarded: '@ms_onboard_post_creation',
  shorts_onboarded: '@ms_onboard_shorts',
} as const;

export type OnboardingKey = keyof typeof KEYS;

interface OnboardingStatus {
  wallet_funded: boolean;
  creator_onboarded: boolean;
  withdrawal_onboarded: boolean;
  subscription_onboarded: boolean;
  paid_content_onboarded: boolean;
  post_creation_onboarded: boolean;
  shorts_onboarded: boolean;
}

const DEFAULT_STATUS: OnboardingStatus = {
  wallet_funded: false,
  creator_onboarded: false,
  withdrawal_onboarded: false,
  subscription_onboarded: false,
  paid_content_onboarded: false,
  post_creation_onboarded: false,
  shorts_onboarded: false,
};

/**
 * Get all onboarding status
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  try {
    const stored = await AsyncStorage.getItem('@ms_onboarding_status');
    if (!stored) return { ...DEFAULT_STATUS };
    return { ...DEFAULT_STATUS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

/**
 * Check if a specific onboarding has been completed
 */
export async function isOnboardingComplete(key: OnboardingKey): Promise<boolean> {
  const status = await getOnboardingStatus();
  return status[key] ?? false;
}

/**
 * Mark an onboarding as complete
 */
export async function completeOnboarding(key: OnboardingKey): Promise<void> {
  try {
    const status = await getOnboardingStatus();
    status[key] = true;
    await AsyncStorage.setItem('@ms_onboarding_status', JSON.stringify(status));
  } catch (e) {
    console.warn('[onboarding] Failed to save status:', e);
  }
}

/**
 * Check and show onboarding if not yet completed
 * Returns true if onboarding should be shown
 */
export async function shouldShowOnboarding(key: OnboardingKey): Promise<boolean> {
  return !(await isOnboardingComplete(key));
}

/**
 * Reset all onboarding progress (for testing)
 */
export async function resetOnboardingStatus(): Promise<void> {
  try {
    await AsyncStorage.removeItem('@ms_onboarding_status');
  } catch (e) {
    console.warn('[onboarding] Failed to reset:', e);
  }
}
