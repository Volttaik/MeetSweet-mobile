import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated2, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { BlurView } from 'expo-blur';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Illustrations ─────────────────────────────────────────────────────────

const ILLUS_SIZE = 200;

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

// ─── Page definitions ─────────────────────────────────────────────────────

const PAGES = [
  {
    key: 'discover',
    tag: 'EXPLORE',
    title: 'Discover Your\nFavorite Creators',
    description: 'Explore top creators and communities built around the content you love most.',
    features: [
      'Videos, shorts & exclusive posts',
      'Browse creators by category',
      'Personalised feed every day',
    ],
    Illustration: IllustrationDiscover,
    accent: 'rgba(110,110,190,0.22)',
    tagColor: 'rgba(140,140,230,0.9)',
  },
  {
    key: 'chat',
    tag: 'CONNECT',
    title: 'Connect Privately\nWith Creators',
    description: 'Send direct messages and receive exclusive content directly from the creators you subscribe to.',
    features: [
      'DM creators directly',
      'Voice messages & photo sharing',
      'Replies that feel personal',
    ],
    Illustration: IllustrationChat,
    accent: 'rgba(60,160,120,0.18)',
    tagColor: 'rgba(80,200,150,0.9)',
  },
  {
    key: 'subscribe',
    tag: 'UNLOCK',
    title: 'Subscribe &\nUnlock More',
    description: 'Subscribe to access exclusive content and directly support the creators who inspire you.',
    features: [
      'Free, Subscriber, and Subscriber Plus tiers',
      'Subscriber-only content unlocked',
      'Cancel anytime, no pressure',
    ],
    Illustration: IllustrationSubscribe,
    accent: 'rgba(190,150,60,0.18)',
    tagColor: 'rgba(230,185,80,0.9)',
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────

function FloatingIllustration({ children }: { children: React.ReactNode }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated2.View style={style}>{children}</Animated2.View>;
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

function FeatureRow({ text }: { text: string }) {
  return (
    <View style={featureStyles.row}>
      <View style={featureStyles.check}>
        <Text style={featureStyles.checkMark}>✓</Text>
      </View>
      <Text style={featureStyles.text}>{text}</Text>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { width: 26, backgroundColor: 'rgba(255,255,255,0.85)' },
});

const featureStyles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check:     {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  checkMark: { color: 'rgba(255,255,255,0.9)', fontSize: 11, lineHeight: 14 },
  text:      {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.55)',
    flex: 1,
    lineHeight: 18,
  },
});

// ─── Main screen ───────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [displayIndex, setDisplayIndex] = useState(0);

  const navigate = (toIndex: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setDisplayIndex(toIndex);
      setActiveIndex(toIndex);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    });
  };

  const goToNext = () => {
    if (activeIndex < PAGES.length - 1) {
      navigate(activeIndex + 1);
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        router.replace('/auth');
      });
    }
  };

  const skip = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      router.replace('/auth');
    });
  };

  const page   = PAGES[displayIndex];
  const isLast = activeIndex === PAGES.length - 1;

  return (
    <MsScreenBackground>
      <View
        style={[
          styles.container,
          {
            paddingTop:    insets.top + 20,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        {/* ── Header: dots + skip ─────────────────────────────── */}
        <View style={styles.header}>
          <Dots count={PAGES.length} active={activeIndex} />
          <MsPressable
            onPress={skip}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </MsPressable>
        </View>

        {/* ── Fading page content ─────────────────────────────── */}
        <Animated.View style={[styles.pageContent, { opacity: fadeAnim }]}>

          {/* Glass illustration card */}
          <View style={[styles.illustrationCard, { backgroundColor: page.accent }]}>
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill}>
              <View style={styles.illustrationCardInner} />
            </BlurView>
            {/* Accent corner glow */}
            <View style={[styles.cornerGlow, { backgroundColor: page.accent }]} />
            <FloatingIllustration>
              <page.Illustration />
            </FloatingIllustration>
          </View>

          {/* Glass text card */}
          <View style={styles.textCard}>
            <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill}>
              <View style={styles.textCardInner} />
            </BlurView>
            <View style={styles.textBlock}>
              {/* Page tag */}
              <View style={[styles.tagPill, { borderColor: page.tagColor + '44' }]}>
                <Text style={[styles.tagText, { color: page.tagColor }]}>{page.tag}</Text>
              </View>

              <Text style={styles.title}>{page.title}</Text>
              <Text style={styles.description}>{page.description}</Text>

              {/* Feature bullets */}
              <View style={styles.featureList}>
                {page.features.map((f) => (
                  <FeatureRow key={f} text={f} />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── CTA button ──────────────────────────────────────── */}
        <MsPressable style={styles.nextBtn} onPress={goToNext}>
          <Text style={styles.nextBtnLabel}>
            {isLast ? 'Get Started' : 'Continue'}
          </Text>
        </MsPressable>

        {/* ── Page indicator below button ─────────────────────── */}
        <Text style={styles.pageHint}>
          {activeIndex + 1} of {PAGES.length}
        </Text>
      </View>
    </MsScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Page content ────────────────────────────────────────
  pageContent: {
    flex: 1,
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Illustration card
  illustrationCard: {
    width:          SCREEN_W - 48,
    aspectRatio:    1.05,
    borderRadius:   32,
    overflow:       'hidden',
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.09)',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 16 },
    shadowOpacity:  0.5,
    shadowRadius:   28,
    elevation:      14,
  },
  illustrationCardInner: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cornerGlow: {
    position:     'absolute',
    bottom:       -40,
    right:        -40,
    width:        160,
    height:       160,
    borderRadius: 80,
    opacity:      0.55,
  },

  // Text card
  textCard: {
    width:        SCREEN_W - 48,
    borderRadius: 24,
    overflow:     'hidden',
    borderWidth:  1,
    borderColor:  'rgba(255,255,255,0.09)',
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation:    8,
  },
  textCardInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  textBlock: {
    padding: 20,
    gap: 10,
    alignItems: 'flex-start',
  },

  // Tag pill
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:      20,
    borderWidth:       1,
    backgroundColor:   'rgba(255,255,255,0.05)',
  },
  tagText: {
    fontSize:    10,
    fontFamily:  'Poppins_600SemiBold',
    letterSpacing: 1.4,
  },

  title: {
    fontSize:      24,
    fontFamily:    'Poppins_700Bold',
    color:         '#FFFFFF',
    lineHeight:    34,
    letterSpacing: -0.4,
  },
  description: {
    fontSize:   13,
    fontFamily: 'Poppins_400Regular',
    color:      'rgba(255,255,255,0.55)',
    lineHeight: 20,
  },

  featureList: {
    gap: 7,
    marginTop: 2,
    width: '100%',
  },

  // ── CTA ────────────────────────────────────────────────
  nextBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius:    50,
    height:          56,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     'rgba(255,255,255,0.6)',
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.4,
    shadowRadius:    20,
    elevation:       8,
  },
  nextBtnLabel: {
    fontFamily:    'Poppins_600SemiBold',
    fontSize:      16,
    color:         '#0A0A0A',
    letterSpacing: 0.1,
  },

  pageHint: {
    textAlign:  'center',
    fontSize:   12,
    fontFamily: 'Poppins_400Regular',
    color:      'rgba(255,255,255,0.22)',
    marginTop:  -8,
  },
});
