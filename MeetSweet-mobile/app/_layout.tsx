import '../global.css';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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
import { WalletProvider } from '@/contexts/WalletContext';
import { PostActionsProvider } from '@/contexts/PostActionsContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { MsToastHost } from '@/components/MsToast';
import { MsGlobalDialogsHost } from '@/components/MsGlobalDialogs';
import { MsHapticsPrompt } from '@/components/MsHapticsPrompt';
import { loadHapticsPreference, onHapticsPromptNeeded } from '@/lib/haptics';
import { markNavigatorReady } from '@/lib/nav';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { T } from '@/constants/theme';
import { enableGlobalScreenProtection } from '@/lib/screen-protection';

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

/**
 * Activates application-wide native screen-capture protection (Android
 * FLAG_SECURE, iOS recording/screenshot blocking + app-switcher blur). Runs
 * after the first render so the native window/key window definitely exists,
 * and is never released — every MeetSweet screen is protected from launch
 * until the app closes.
 */
function GlobalScreenProtection() {
  useEffect(() => {
    enableGlobalScreenProtection();
  }, []);
  return null;
}

function AppServices() {
  // Drain offline queue whenever network is restored
  useOfflineQueue();
  // Load the persisted haptics preference so the very first haptic call is
  // gated correctly (and triggers the one-time enable/disable prompt if the
  // user hasn't chosen yet).
  useEffect(() => {
    loadHapticsPreference().catch(() => {});
  }, []);
  return null;
}

function HapticsGate() {
  const [promptVisible, setPromptVisible] = React.useState(false);

  useEffect(() => {
    return onHapticsPromptNeeded(() => setPromptVisible(true));
  }, []);

  return (
    <MsHapticsPrompt
      visible={promptVisible}
      onClose={() => setPromptVisible(false)}
    />
  );
}

function RootLayoutNav() {
  // Signal that the navigator has settled AFTER the initial route resolution
  // (index → Redirect → (tabs)/welcome) so navigation fired from notification
  // taps or deep links never races the cold-start redirect — a push during
  // that window can leave the target screen rendered but non-interactive.
  useEffect(() => {
    const t = setTimeout(() => markNavigatorReady(), 0);
    return () => clearTimeout(t);
  }, []);

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
      <Stack.Screen name="two-factor" options={{ gestureEnabled: false }} />
      <Stack.Screen name="success" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Auth → App transition */}
      <Stack.Screen name="home" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Authenticated tab shell */}
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Authenticated push screens */}
      <Stack.Screen name="notifications"         options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings"              options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="wallet"                options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="chat-room/[chatRoomId]" options={{ animation: 'slide_from_right', headerShown: false }} />
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

  // Hold the native splash until the theme fonts are ready (or failed); the
  // fonts have sensible fallbacks, so render immediately on error.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.BG }}>
            {/* Native bottom sheets (sticker/GIF picker, action sheets) render
                through this provider — @gorhom/bottom-sheet runs on the
                Reanimated UI thread, no JS-driven modal animation. */}
            <BottomSheetModalProvider>
            <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
              <KeyboardProvider>
                <AuthProvider>
                  <WalletProvider>
                    <PostActionsProvider>
                      <NotificationsProvider>
                        <GlobalScreenProtection />
                        <AppServices />
                        <RootLayoutNav />
                        <MsToastHost />
                        <MsGlobalDialogsHost />
                        <HapticsGate />
                      </NotificationsProvider>
                    </PostActionsProvider>
                  </WalletProvider>
                </AuthProvider>
              </KeyboardProvider>
            </HeroUINativeProvider>
            </BottomSheetModalProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}