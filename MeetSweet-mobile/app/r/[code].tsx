import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { savePendingReferralCode } from '@/services/referrals';

export default function ReferralDeepLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const normalized = String(code ?? '').trim().toUpperCase();

  useEffect(() => {
    if (normalized) void savePendingReferralCode(normalized);
  }, [normalized]);

  if (!normalized) return <Redirect href="/register" />;
  return <Redirect href={{ pathname: '/register', params: { referral: normalized } }} />;
}
