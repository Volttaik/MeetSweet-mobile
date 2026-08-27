/**
 * First-Install Welcome Notification
 *
 * Sends a single device push — "Welcome to MeetSweet" — on the FIRST launch
 * after a fresh installation, right after push setup succeeds (permission
 * granted + Expo push token obtained).
 *
 * Exactly-once guarantee comes from a persistent AsyncStorage flag:
 *   • launches / app reloads / OTA updates keep AsyncStorage → never re-fires
 *   • only a reinstall (fresh app data) clears the flag → re-arms for the
 *     next installation
 * The flag is written only AFTER the notification is actually scheduled, so a
 * failed schedule can safely retry on a later launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const WELCOME_SENT_KEY = '@ms_welcome_notification_sent';

export async function maybeSendWelcomeNotification(): Promise<void> {
  try {
    const alreadySent = await AsyncStorage.getItem(WELCOME_SENT_KEY);
    if (alreadySent === '1') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Welcome to MeetSweet',
        body: 'Thanks for joining — your feed is waiting.',
        // Synthetic type so the in-app badge listener can skip it — this is
        // not a server notification and must never count toward unread.
        data: { type: 'welcome' },
      },
      trigger: null, // deliver immediately
    });

    await AsyncStorage.setItem(WELCOME_SENT_KEY, '1');
  } catch {
    // Non-fatal — never crash launch. The flag stays unset, so a later launch
    // retries until the welcome push actually goes out once.
  }
}
