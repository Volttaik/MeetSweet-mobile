import '../global.css';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroUINativeProvider } from 'heroui-native';
import { Uniwind } from 'uniwind';

// MeetSweet is a dark-first app — force dark theme
Uniwind.setTheme('dark');

import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { AuthProvider } from '@/contexts/AuthContext';
import { PostActionsProvider } from '@/contexts/PostActionsContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { MsOfflineBanner } from '@/components/MsOfflineBanner';
import { MsToastHost } from '@/components/MsToast';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { T } from '@/constants/theme';

// Set native background colour immediately — prevents the white flash
// that occurs while React Native paints the first frame.
SystemUI.setBackgroundColorAsync(T.BG);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppServices() {
  // Drain offline queue whenever network is restored
  useOfflineQueue();
  return null;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 260,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        fullScreenGestureEnabled: true,
        // Dark background at every layer — prevents white flash during transitions
        contentStyle: { backgroundColor: T.BG },
      }}
    >
      {/* Onboarding & Auth */}
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'none' }} />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="auth" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="success" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Legacy screens (kept for compatibility) */}
      <Stack.Screen name="get-started" />
      <Stack.Screen name="create-account" />
      <Stack.Screen name="create-password" />
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="complete-registration" />
      <Stack.Screen name="verification" />

      {/* Auth → App transition */}
      <Stack.Screen name="home" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Authenticated tab shell */}
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Authenticated push screens */}
      <Stack.Screen name="notifications"         options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings"              options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="edit-profile"          options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="privacy-settings"      options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="security-settings"     options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notification-settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="wallet"                options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="videos/index" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="videos/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="shorts/index" options={{ animation: 'slide_from_bottom', headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: '#000' } }} />
      <Stack.Screen name="creator/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="content/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="album/[id]" options={{ animation: 'slide_from_right', headerShown: false }} />
      <Stack.Screen name="create-album" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="creator-payout" options={{ animation: 'slide_from_right', headerShown: false }} />

      {/* Authenticated modal screens */}
      <Stack.Screen
        name="become-creator"
        options={{ animation: 'slide_from_bottom', gestureEnabled: true }}
      />
      <Stack.Screen
        name="create-post"
        options={{ animation: 'slide_from_bottom', gestureEnabled: true, presentation: 'modal' }}
      />
      <Stack.Screen name="creator-dashboard" options={{ animation: 'slide_from_right' }} />
      {/* Share deep-link resolver */}
      <Stack.Screen name="s/[token]" options={{ animation: 'fade', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // On web, a native splash screen is not displayed and returning null here
  // leaves the preview as a blank dark page if a font request stalls. The
  // theme fonts have sensible fallbacks, so render the navigation immediately
  // while the font faces finish loading.
  if (!fontsLoaded && !fontError) {
    // Keep the native splash behavior unchanged; the web preview must not wait
    // indefinitely for a font resource before mounting the router.
    if (Platform.OS !== 'web') return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.BG }}>
            <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
              <KeyboardProvider>
                <AuthProvider>
                  <NotificationsProvider>
                    <PostActionsProvider>
                      <AppServices />
                      <RootLayoutNav />
                      <MsOfflineBanner />
                      <MsToastHost />
                    </PostActionsProvider>
                  </NotificationsProvider>
                </AuthProvider>
              </KeyboardProvider>
            </HeroUINativeProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
