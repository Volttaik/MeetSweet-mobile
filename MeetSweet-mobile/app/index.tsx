import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getInitialReferralCode, getInitialShareToken } from '@/lib/deep-link';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  // undefined = launch URL not yet resolved; null = opened normally.
  const [shareToken, setShareToken] = useState<string | null | undefined>(undefined);
  const [referralCode, setReferralCode] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getInitialShareToken(), getInitialReferralCode()]).then(([token, referral]) => {
      if (!cancelled) {
        setShareToken(token);
        setReferralCode(referral);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hold the neutral loading state until BOTH the session and the launch URL
  // are known. When the app was opened from a share link, the deep-link
  // resolver must be the first screen — never the home feed or onboarding.
  if (isLoading || shareToken === undefined || referralCode === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (shareToken) {
    return <Redirect href={`/s/${shareToken}`} />;
  }

  if (referralCode) {
    return <Redirect href={{ pathname: '/register', params: { referral: referralCode } }} />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/welcome" />;
}
