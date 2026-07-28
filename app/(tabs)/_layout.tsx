import React, { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { House, MagnifyingGlass, ChatCircle, User, FilmStrip, Images, type Icon } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { tapLight, tapMedium } from '@/lib/haptics';

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.title}>Create</Text>
          <Text style={sheetStyles.subtitle}>What would you like to share?</Text>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => router.push('/create-post'), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <FilmStrip size={24} color={T.ACCENT} />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Create Post</Text>
              <Text style={sheetStyles.optionDesc}>Share a single photo or video</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.option}
            activeOpacity={0.8}
            onPress={() => { onClose(); setTimeout(() => router.push('/create-album'), 150); }}
          >
            <View style={sheetStyles.optionIcon}>
              <Images size={24} color={T.ACCENT} />
            </View>
            <View style={sheetStyles.optionText}>
              <Text style={sheetStyles.optionLabel}>Create Album</Text>
              <Text style={sheetStyles.optionDesc}>Curate a premium collection of media</Text>
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
        {VISUAL_TABS.map((tab, i) => (
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
