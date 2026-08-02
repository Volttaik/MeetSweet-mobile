/**
 * useOnboarding.ts — Hook for managing onboarding state
 */
import { useState, useEffect, useCallback } from 'react';
import {
  shouldShowOnboarding,
  completeOnboarding,
  getOnboardingStatus,
  type OnboardingKey,
} from '@/services/onboarding';
import type { OnboardingScreen } from '@/components/MsOnboardingModal';

interface UseOnboardingReturn {
  showOnboarding: boolean;
  loading: boolean;
  screens: OnboardingScreen[];
  handleComplete: () => void;
  handleSkip: () => void;
  refreshStatus: () => Promise<void>;
}

export function useOnboarding(
  key: OnboardingKey,
  screens: OnboardingScreen[]
): UseOnboardingReturn {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkOnboarding = useCallback(async () => {
    setLoading(true);
    const shouldShow = await shouldShowOnboarding(key);
    setShowOnboarding(shouldShow);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  const handleComplete = useCallback(async () => {
    await completeOnboarding(key);
    setShowOnboarding(false);
  }, [key]);

  const handleSkip = useCallback(() => {
    // Skip just hides the modal, doesn't mark as complete
    setShowOnboarding(false);
  }, []);

  const refreshStatus = useCallback(async () => {
    await checkOnboarding();
  }, [checkOnboarding]);

  return {
    showOnboarding,
    loading,
    screens,
    handleComplete,
    handleSkip,
    refreshStatus,
  };
}

/**
 * Hook for multiple onboarding flows
 */
export function useAllOnboardingStatuses() {
  const [statuses, setStatuses] = useState<Record<OnboardingKey, boolean>>({
    wallet_funded: false,
    creator_onboarded: false,
    withdrawal_onboarded: false,
    subscription_onboarded: false,
    paid_content_onboarded: false,
    post_creation_onboarded: false,
    shorts_onboarded: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const all = await getOnboardingStatus();
    setStatuses(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statuses, loading, refresh };
}
