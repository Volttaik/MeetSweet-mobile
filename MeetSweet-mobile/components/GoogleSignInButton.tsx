import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/services/api';
import { googleClientIds, isGoogleAuthConfigured } from '@/lib/google-config';

export interface GoogleAuthResult {
  isNewUser: boolean;
}

interface GoogleSignInButtonProps {
  referralCode?: string;
  onSuccess: (result: GoogleAuthResult) => void | Promise<void>;
  onError: (message: string) => void;
}

function ButtonShell({
  children,
  disabled,
  onPress,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {children}
    </TouchableOpacity>
  );
}

function GoogleMark() {
  return <Text style={styles.googleMark}>G</Text>;
}

function ConfiguredGoogleSignInButton({
  referralCode,
  onSuccess,
  onError,
}: GoogleSignInButtonProps) {
  const { googleLogin } = useAuth();
  const [request, response, promptAsync] = useIdTokenAuthRequest(
    {
      webClientId: googleClientIds.web,
      androidClientId: googleClientIds.android,
      iosClientId: googleClientIds.ios,
      selectAccount: true,
    },
    { scheme: 'meetsweet' },
  );
  const [loading, setLoading] = useState(false);
  const handledResponse = useRef<unknown>(null);

  useEffect(() => {
    if (!response || response === handledResponse.current) return;
    handledResponse.current = response;

    if (response.type !== 'success') {
      if (response.type === 'error') onError('Google authentication was not completed.');
      return;
    }

    const idToken = response.params?.id_token;
    if (!idToken) {
      onError('Google did not return a verifiable identity token.');
      return;
    }

    setLoading(true);
    googleLogin(idToken, referralCode)
      .then((result) => onSuccess({ isNewUser: result.isNewUser }))
      .catch((error: unknown) => {
        if (error instanceof ApiError) onError(error.message);
        else onError('Google authentication failed. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [googleLogin, onError, onSuccess, referralCode, response]);

  const start = async () => {
    onError('');
    try {
      await promptAsync();
    } catch {
      onError('Google authentication failed. Please try again.');
    }
  };

  return (
    <ButtonShell disabled={!request || loading} onPress={start}>
      {loading ? <ActivityIndicator size="small" color="#1F1F1F" /> : <GoogleMark />}
      <Text style={styles.label}>Continue with Google</Text>
    </ButtonShell>
  );
}

export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  const isExpoGo = Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (!isGoogleAuthConfigured || isExpoGo) {
    return (
      <ButtonShell
        onPress={() => props.onError(
          isExpoGo
            ? 'Google sign-in requires a MeetSweet development build or preview APK, not Expo Go.'
            : 'Google authentication is not configured for this build.',
        )}
      >
        <GoogleMark />
        <Text style={styles.label}>Continue with Google</Text>
      </ButtonShell>
    );
  }

  return <ConfiguredGoogleSignInButton {...props} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.55 },
  googleMark: {
    color: '#4285F4',
    fontSize: 21,
    fontFamily: 'Poppins_700Bold',
  },
  label: {
    color: '#1F1F1F',
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
});
