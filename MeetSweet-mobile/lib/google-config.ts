import { Platform } from 'react-native';

export const googleClientIds = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || undefined,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
} as const;

const activeClientId = Platform.select({
  android: googleClientIds.android,
  ios: googleClientIds.ios,
  default: googleClientIds.web,
});

export const isGoogleAuthConfigured = Boolean(activeClientId);
