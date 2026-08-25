import React, { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { Tabs, router, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { House, MagnifyingGlass, Envelope, User, ChatCircle, Images, VideoCamera, MonitorPlay, TextT, type Icon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { BrandGradientFill } from '@/components/BrandGradientFill';
import { GradientTopFade } from '@/components/GradientTopFade';
import { GradientIcon, type GradientIconName } from '@/components/GradientIcon';
import { tapLight, tapMedium } from '@/lib/haptics';
import { pushOnce } from '@/lib/nav';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { dialogs } from '@/components/MsGlobalDialogs';

const TAB_HEIGHT = 60;
const INACTIVE_COLOR = T.TEXT_3;

type VisualTab = {
  label: string;
  Icon: Icon;
  /** Gradient glyph name — active tabs paint the brand gradient inside the
   *  icon's exact shape instead of using a solid fill. */
  gradientName?: GradientIconName;
  routeName?: string; // undefined = center action
  badge?: number;
};

const VISUAL_TABS: VisualTab[] = [
  { label: 'Home',     Icon: House,           gradientName: 'house',           routeName: 'index' },
  { label: 'Explore',  Icon: MagnifyingGlass, gradientName: 'magnifying-glass', routeName: 'explore' },
  { label: 'Create',   Icon: ChatCircle },
  // Private Inbox lives OUTSIDE the tab navigator (app/messages.tsx is a
  // root stack screen), so this slot pushes the stack route instead of
  // navigating within the tabs — navigating to a non-existent tab route was
  // silently dropped, leaving a dead button.
  { label: 'Messages', Icon: Envelope,        gradientName: 'envelope',        routeName: 'messages' },
  { label: 'Profile',  Icon: User,            gradientName: 'user',            routeName: 'profile' },
];

function TabBadgeDot({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <View style={badgeStyles.wrap}>
      <BrandGradientFill />
      {count <= 9 ? (
        <Text style={badgeStyles.text}>{count}</Text>
      ) : (
        <Text style={badgeStyles.text}>9+</Text>
      )}
    </View>
  );
}

function TabBtn({
  tab,
  isActive,
  onPress,
}: {
  tab: VisualTab;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  // 0→1→0 tap signal: while it runs, the gradient inside the active icon
  // subtly shifts direction, then settles back — fast, smooth, in-icon only.
  const gradientMotion = useSharedValue(0);

  const handlePress = () => {
    // Spring bounce with haptic
    if (tab.routeName === undefined) {
      tapMedium();
    } else {
      tapLight();
    }
    scale.value = withSpring(0.82, { damping: 12, stiffness: 400, mass: 1 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 280, mass: 1 });
    });
    gradientMotion.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }),
    );
    onPress();
  };

  // Center Create button
  if (tab.routeName === undefined) {
    return (
      <Pressable onPress={handlePress} style={styles.centerWrap}>
        <Animated.View style={[styles.centerBtn, scaleStyle]}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.centerLogo}
            resizeMode="contain"
            accessibilityLabel="MeetSweet"
          />
        </Animated.View>
      </Pressable>
    );
  }

  // Active tab: the brand gradient is clipped INSIDE the icon's own shape
  // (GradientIcon paints the fill-weight glyph with the gradient as its fill —
  // nothing outside the icon receives any gradient). Inactive tabs stay
  // neutral line icons.
  return (
    <Pressable onPress={handlePress} style={styles.tabWrap}>
      <Animated.View style={[styles.tabInner, scaleStyle]}>
        <View style={styles.iconWrap}>
          {isActive && tab.gradientName ? (
            <GradientIcon name={tab.gradientName} size={22} motion={gradientMotion} />
          ) : (
            <tab.Icon
              size={22}
              color={isActive ? '#FFFFFF' : INACTIVE_COLOR}
              weight={isActive ? 'fill' : 'bold'}
            />
          )}
          <TabBadgeDot count={tab.badge} />
        </View>
        <Text
          style={[
            styles.tabLabel,
            { color: isActive ? T.PRIMARY_LIGHT : INACTIVE_COLOR, fontFamily: T.FONT.bold },
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Create Action Sheet ───────────────────────────────────────────────────────

function CreateActionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Creator-only actions (albums, videos, shorts) open a styled bottom sheet
  // for non-creators instead of a dead-end "Creator account required" error.
  // The sheet's Become-a-Creator action hits the server and refreshes auth
  // state, then continues to the intended destination; the server stays the
  // authority on who may create.
  const openCreatorOnly = useCallback((push: () => void, message?: string) => {
    if (!user?.isCreator) {
      dialogs.creatorGate({ message, onSuccess: push });
      return;
    }
    push();
  }, [user?.isCreator]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <GradientTopFade height={56} radius={24} />
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.title}>Create</Text>
          <Text style={sheetStyles.subtitle}>What would you like to share?</Text>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => router.push({ pathname: '/create-post', params: { type: 'post' } }), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <BrandGradientFill />
              <TextT size={22} color="#FFFFFF" weight="bold" />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Post</Text>
              <Text style={sheetStyles.optionDesc}>Text + images · shows in Home feed</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push('/create-album'), 'Albums are a creator feature — set a price and sell your collection.'), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <BrandGradientFill />
              <Images size={22} color="#FFFFFF" />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Album</Text>
              <Text style={sheetStyles.optionDesc}>Gallery of photos/videos · Home feed</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push({ pathname: '/create-post', params: { type: 'video' } }), 'Long-form videos are a creator feature.'), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <BrandGradientFill />
              <MonitorPlay size={22} color="#FFFFFF" />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Video</Text>
              <Text style={sheetStyles.optionDesc}>Long-form video · shows in Explore</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push({ pathname: '/create-post', params: { type: 'shorts' } }), 'Shorts are a creator feature.'), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <BrandGradientFill />
              <VideoCamera size={22} color="#FFFFFF" />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Shorts</Text>
              <Text style={sheetStyles.optionDesc}>Vertical video up to 60s · Shorts feed</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={sheetStyles.cancelBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={sheetStyles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: T.SURFACE_2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontFamily: T.FONT.bold, color: T.TEXT },
  optionDesc: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: T.FONT.bold,
    color: T.TEXT_2,
  },
});

// ─── Custom tab bar ────────────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const { notifUnread } = useNotifications();

  // Inject live badge counts into the visual tab definitions
  const tabsWithBadges: VisualTab[] = VISUAL_TABS.map((tab) => tab);

  const handlePress = useCallback(
    (tab: VisualTab) => {
      if (tab.routeName === undefined) {
        setCreateSheetVisible(true);
        return;
      }
      if (tab.routeName === 'messages') {
        // Stack screen outside the tabs group — always push it.
        pushOnce('/messages');
        return;
      }
      const route = state.routes.find(
        (candidate: { name: string }) => candidate.name === tab.routeName,
      );
      if (route && state.routes[state.index]?.name !== tab.routeName) {
        navigation.navigate(route.name);
      }
    },
    [state, navigation],
  );

  return (
    <>
      <View
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0) },
        ]}
      >
        {tabsWithBadges.map((tab, i) => (
          <TabBtn
            key={i}
            tab={tab}
            isActive={
              tab.routeName !== undefined &&
              state.routes[state.index]?.name === tab.routeName
            }
            onPress={() => handlePress(tab)}
          />
        ))}
      </View>

      <CreateActionSheet
        visible={createSheetVisible}
        onClose={() => setCreateSheetVisible(false)}
      />
    </>
  );
}

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Authenticated shell only. A logged-out boot (direct web URL, stale
  // navigation history, or a deep link to a tab route) must never render the
  // tab screens — they would show placeholder "U"/"Display Name" states with
  // no session to fetch real data. Wait for session restore, then route to
  // Login if there is no valid session.
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: T.BG }} />;
  }
  if (!isAuthenticated) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar state={props.state} navigation={props.navigation} />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: T.SECONDARY,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: T.BG,
  },
  text: {
    fontSize: 9,
    fontFamily: T.FONT.bold,
    color: T.ACCENT_FG,
    lineHeight: 12,
  },
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: T.BG,
    paddingTop: 8,
    borderTopWidth: 0,
  },
  tabWrap: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    position: 'relative',
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
  centerWrap: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
