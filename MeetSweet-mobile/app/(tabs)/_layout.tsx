import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Tabs, router, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { House, MagnifyingGlass, ChatCircle, User, FilmStrip, Images, VideoCamera, MonitorPlay, TextT, type Icon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { dialogs } from '@/components/MsGlobalDialogs';

const TAB_HEIGHT = 60;
const INACTIVE_COLOR = '#777777';

type VisualTab = {
  label: string;
  Icon: Icon;
  routeName?: string; // undefined = center action
  badge?: number;
};

const VISUAL_TABS: VisualTab[] = [
  { label: 'Home',     Icon: House,           routeName: 'index' },
  { label: 'Explore',  Icon: MagnifyingGlass, routeName: 'explore' },
  { label: 'Create',   Icon: ChatCircle },
  { label: 'Messages', Icon: ChatCircle,      routeName: 'messages' },
  { label: 'Profile',  Icon: User,            routeName: 'profile' },
];

function TabBadgeDot({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <View style={badgeStyles.wrap}>
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

  const iconColor = isActive ? T.TEXT : INACTIVE_COLOR;

  return (
    <Pressable onPress={handlePress} style={styles.tabWrap}>
      <Animated.View style={[styles.tabInner, scaleStyle]}>
        <View style={styles.iconWrap}>
          <tab.Icon size={22} color={iconColor} weight="regular" />
          <TabBadgeDot count={tab.badge} />
        </View>
        <Text
          style={[
            styles.tabLabel,
            { color: iconColor, fontFamily: isActive ? T.FONT.semibold : T.FONT.regular },
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

  const sheetRef = useRef<BottomSheetModal>(null);
  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useMemo(
    () => (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={['auto']}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.sheetBackground}
      handleIndicatorStyle={sheetStyles.handle}
      onDismiss={onClose}
    >
      <BottomSheetView
        style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) }}
      >
        <Text style={sheetStyles.title}>Create</Text>
        <Text style={sheetStyles.subtitle}>What would you like to share?</Text>

        <MsPressable
          style={sheetStyles.option}
          onPress={() => { onClose(); setTimeout(() => router.push({ pathname: '/create-post', params: { type: 'post' } }), 150); }}
        >
          <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(196,90,114,0.14)' }]}>
            <TextT size={22} color={T.ACCENT} weight="bold" />
          </View>
          <View style={sheetStyles.optionText}>
            <Text style={sheetStyles.optionLabel}>Post</Text>
            <Text style={sheetStyles.optionDesc}>Text + images · shows in Home feed</Text>
          </View>
        </MsPressable>

        <MsPressable
          style={sheetStyles.option}
          onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push('/create-album'), 'Albums are a creator feature — set a price and sell your collection.'), 150); }}
        >
          <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(124,92,202,0.14)' }]}>
            <Images size={22} color="#7C5CCA" />
          </View>
          <View style={sheetStyles.optionText}>
            <Text style={sheetStyles.optionLabel}>Album</Text>
            <Text style={sheetStyles.optionDesc}>Gallery of photos/videos · Home feed</Text>
          </View>
        </MsPressable>

        <MsPressable
          style={sheetStyles.option}
          onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push({ pathname: '/create-post', params: { type: 'video' } }), 'Long-form videos are a creator feature.'), 150); }}
        >
          <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(37,99,235,0.14)' }]}>
            <MonitorPlay size={22} color="#2563EB" />
          </View>
          <View style={sheetStyles.optionText}>
            <Text style={sheetStyles.optionLabel}>Video</Text>
            <Text style={sheetStyles.optionDesc}>Long-form video · shows in Explore</Text>
          </View>
        </MsPressable>

        <MsPressable
          style={sheetStyles.option}
          onPress={() => { onClose(); setTimeout(() => openCreatorOnly(() => router.push({ pathname: '/create-post', params: { type: 'shorts' } }), 'Shorts are a creator feature.'), 150); }}
        >
          <View style={[sheetStyles.optionIcon, { backgroundColor: 'rgba(220,38,38,0.14)' }]}>
            <VideoCamera size={22} color="#DC2626" />
          </View>
          <View style={sheetStyles.optionText}>
            <Text style={sheetStyles.optionLabel}>Shorts</Text>
            <Text style={sheetStyles.optionDesc}>Vertical video up to 60s · Shorts feed</Text>
          </View>
        </MsPressable>

        <MsPressable style={sheetStyles.cancelBtn} onPress={onClose}>
          <Text style={sheetStyles.cancelLabel}>Cancel</Text>
        </MsPressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const sheetStyles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: T.SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: T.BORDER_2,
  },
  title: {
    fontSize: 20,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.4,
    marginBottom: 4,
    marginTop: 4,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontFamily: T.FONT.semibold, color: T.TEXT },
  optionDesc: { fontSize: 12, fontFamily: T.FONT.regular, color: T.TEXT_2, marginTop: 2 },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
});

// ─── Custom tab bar ────────────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const { notifUnread, messageUnread } = useNotifications();

  // Inject live badge counts into the visual tab definitions
  const tabsWithBadges: VisualTab[] = VISUAL_TABS.map((tab) => {
    if (tab.routeName === 'messages') return { ...tab, badge: messageUnread > 0 ? messageUnread : undefined };
    return tab;
  });

  const handlePress = useCallback(
    (tab: VisualTab) => {
      if (tab.routeName === undefined) {
        setCreateSheetVisible(true);
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
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
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
      <Tabs.Screen name="messages" />
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
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: T.BG,
  },
  text: {
    fontSize: 9,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
});
