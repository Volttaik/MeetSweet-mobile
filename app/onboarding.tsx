import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MsScreenBackground } from '@/components/MsScreenBackground';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Illustrations ─────────────────────────────────────────────────────────

const ILLUS_SIZE = 240;

function IllustrationDiscover() {
  return (
    <Svg width={ILLUS_SIZE} height={ILLUS_SIZE} viewBox="0 0 220 220">
      <Rect x="20" y="60" width="80" height="100" rx="16" fill="#141414" />
      <Circle cx="60" cy="100" r="22" fill="#1E1E1E" />
      <Circle cx="60" cy="100" r="14" fill="#2A2A2A" />
      <Rect x="34" y="128" width="52" height="8" rx="4" fill="#202020" />
      <Rect x="42" y="142" width="36" height="6" rx="3" fill="#1A1A1A" />

      <Rect x="120" y="40" width="80" height="100" rx="16" fill="#141414" />
      <Circle cx="160" cy="80" r="22" fill="#1E1E1E" />
      <Circle cx="160" cy="80" r="14" fill="#2A2A2A" />
      <Rect x="134" y="108" width="52" height="8" rx="4" fill="#202020" />
      <Rect x="142" y="122" width="36" height="6" rx="3" fill="#1A1A1A" />

      <Path d="M100 50 C100 44 92 40 88 46 C84 40 76 44 76 50 C76 60 88 68 88 68 C88 68 100 60 100 50Z" fill="rgba(255,255,255,0.85)" />
      <Path d="M155 165 C155 161 150 158 148 162 C146 158 141 161 141 165 C141 171 148 176 148 176 C148 176 155 171 155 165Z" fill="rgba(255,255,255,0.4)" />
      <Circle cx="30" cy="44" r="3" fill="rgba(255,255,255,0.25)" />
      <Circle cx="190" cy="160" r="3" fill="rgba(255,255,255,0.25)" />
    </Svg>
  );
}

function IllustrationChat() {
  return (
    <Svg width={ILLUS_SIZE} height={ILLUS_SIZE} viewBox="0 0 220 220">
      <Rect x="20" y="50" width="130" height="48" rx="16" fill="#141414" />
      <Path d="M20 98 L8 110 L32 98Z" fill="#141414" />
      <Rect x="36" y="65" width="96" height="8" rx="4" fill="#222222" />
      <Rect x="36" y="79" width="72" height="8" rx="4" fill="#1C1C1C" />

      <Rect x="70" y="120" width="130" height="48" rx="16" fill="rgba(255,255,255,0.9)" />
      <Path d="M200 168 L212 180 L188 168Z" fill="rgba(255,255,255,0.9)" />
      <Rect x="86" y="135" width="96" height="8" rx="4" fill="rgba(0,0,0,0.2)" />
      <Rect x="86" y="149" width="64" height="8" rx="4" fill="rgba(0,0,0,0.2)" />

      <Circle cx="176" cy="76" r="24" fill="#0A0A0A" />
      <Circle cx="176" cy="76" r="20" fill="#141414" />
      <Rect x="166" y="74" width="20" height="14" rx="4" fill="rgba(255,255,255,0.9)" />
      <Path d="M171 74 C171 68 181 68 181 74" stroke="rgba(255,255,255,0.9)" strokeWidth="3" fill="none" />
      <Circle cx="176" cy="81" r="2" fill="#141414" />

      <Circle cx="50" cy="185" r="3" fill="rgba(255,255,255,0.2)" />
      <Circle cx="170" cy="40" r="3" fill="rgba(255,255,255,0.2)" />
    </Svg>
  );
}

function IllustrationSubscribe() {
  return (
    <Svg width={ILLUS_SIZE} height={ILLUS_SIZE} viewBox="0 0 220 220">
      <Path
        d="M60 140 L60 100 L85 120 L110 80 L135 120 L160 100 L160 140Z"
        fill="rgba(255,255,255,0.88)"
      />
      <Circle cx="110" cy="110" r="8" fill="rgba(255,255,255,0.5)" />
      <Circle cx="85" cy="122" r="5" fill="rgba(255,255,255,0.35)" />
      <Circle cx="135" cy="122" r="5" fill="rgba(255,255,255,0.35)" />

      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 110 + Math.cos(rad) * 60;
        const y1 = 110 + Math.sin(rad) * 60;
        const x2 = 110 + Math.cos(rad) * 74;
        const y2 = 110 + Math.sin(rad) * 74;
        return (
          <Path key={i} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
        );
      })}

      <Circle cx="165" cy="165" r="22" fill="#0A0A0A" />
      <Rect x="155" y="163" width="20" height="14" rx="4" fill="rgba(255,255,255,0.9)" />
      <Path d="M159 163 C159 153 171 153 171 163" stroke="rgba(255,255,255,0.9)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Circle cx="165" cy="170" r="2" fill="#0A0A0A" />

      <Circle cx="45" cy="70" r="4" fill="rgba(255,255,255,0.25)" />
      <Circle cx="40" cy="165" r="3" fill="rgba(255,255,255,0.18)" />
    </Svg>
  );
}

const PAGES = [
  {
    key: 'discover',
    title: 'Discover Your\nFavorite Creators',
    description: 'Explore premium creators and vibrant communities built around the content you love most.',
    Illustration: IllustrationDiscover,
  },
  {
    key: 'chat',
    title: 'Connect Privately\nWith Creators',
    description: 'Send direct messages and receive exclusive content directly from the creators you follow.',
    Illustration: IllustrationChat,
  },
  {
    key: 'subscribe',
    title: 'Subscribe &\nUnlock More',
    description: 'Subscribe to unlock premium content and directly support the creators who inspire you.',
    Illustration: IllustrationSubscribe,
  },
];

function FloatingIllustration({ children }: { children: React.ReactNode }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,  { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[dotStyles.dot, i === active && dotStyles.dotActive]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { width: 26, backgroundColor: 'rgba(255,255,255,0.85)' },
});

const H_PAD = 32;
const PAGE_W = SCREEN_W - H_PAD * 2;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goToNext = () => {
    if (activeIndex < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      // Use replace so the user cannot swipe back to onboarding
      router.replace('/auth');
    }
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const isLast = activeIndex === PAGES.length - 1;

  return (
    <MsScreenBackground>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 72 : 20),
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 40 : 32),
          },
        ]}
      >
        {/* Header row: dots + skip */}
        <View style={styles.header}>
          <Dots count={PAGES.length} active={activeIndex} />
          <TouchableOpacity
            onPress={() => router.replace('/auth')}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Pages */}
        <FlatList
          ref={flatListRef}
          data={PAGES}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          style={styles.flatList}
          renderItem={({ item }) => (
            <View style={[styles.page, { width: PAGE_W }]}>
              <FloatingIllustration>
                <View style={styles.illustrationWrap}>
                  <item.Illustration />
                </View>
              </FloatingIllustration>
              <View style={styles.textBlock}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </View>
          )}
          getItemLayout={(_, index) => ({
            length: PAGE_W,
            offset: PAGE_W * index,
            index,
          })}
        />

        {/* CTA button */}
        <TouchableOpacity style={styles.nextBtn} onPress={goToNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnLabel}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </MsScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: H_PAD,
    gap: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.38)',
  },
  flatList: {
    flex: 1,
    marginHorizontal: -H_PAD,
    paddingHorizontal: H_PAD,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    paddingHorizontal: 4,
  },
  illustrationWrap: {
    width: ILLUS_SIZE,
    height: ILLUS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { gap: 14, alignItems: 'center' },
  title: {
    fontSize: 34,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.6,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    lineHeight: 25,
    paddingHorizontal: 4,
  },
  nextBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 50,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  nextBtnLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
