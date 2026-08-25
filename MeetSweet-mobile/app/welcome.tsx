import React, { useEffect } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientText } from '@/components/GradientText';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { LinearGradient } from 'expo-linear-gradient';
import { T, alpha, AppGradients } from '@/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const HIGHLIGHTS = [
  { text: 'Exclusive creator content & communities' },
  { text: 'Private messaging with your favourite creators' },
  { text: 'Subscribe & directly support creators you love' },
];

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(28);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);

  const navigate = () => router.push('/auth');

  const handleGetStarted = () => {
    slideX.value = withTiming(
      -SCREEN_W,
      { duration: 260, easing: Easing.in(Easing.cubic) },
      () => { runOnJS(navigate)(); },
    );
    slideOpacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
  };

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  return (
    <MsScreenBackground>
      <Animated.View
        style={[
          styles.container,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 72 : 40),
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 40 : 44),
          },
          slideStyle,
        ]}
      >
        {/* Logo */}
        <FadeUp delay={0}>
          <View style={styles.logoRow}>
            <Image
              source={require('../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <GradientText text="MeetSweet" style={styles.logoText} />
          </View>
        </FadeUp>

        {/* Hero */}
        <FadeUp delay={100}>
          <View style={styles.hero}>
            <Text style={styles.headline}>Where creators{'\n'}meet their community</Text>
            <Text style={styles.description}>
              The premium platform connecting fans and creators through exclusive content, private
              chats, and meaningful subscriptions.
            </Text>

            <View style={styles.highlights}>
              {HIGHLIGHTS.map((h, i) => (
                <View key={i} style={styles.highlightRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.highlightText}>{h.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeUp>

        {/* Actions */}
        <View style={styles.actions}>
          <FadeUp delay={220}>
            <TouchableOpacity
              style={styles.primaryBtnWrap}
              onPress={handleGetStarted}
              activeOpacity={0.85}
            >
              {/* Brand gradient CTA — purple → crimson (linen text stays ≥4.2:1) */}
              <LinearGradient colors={AppGradients.brand} locations={AppGradients.brandLocs} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnLabel}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>
          </FadeUp>

          <FadeUp delay={300}>
            <Text style={styles.terms}>
              By continuing you agree to our{' '}
              <Text style={styles.termsLink}>Terms</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </FadeUp>
        </View>
      </Animated.View>
    </MsScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: { width: 44, height: 44 },
  logoText: {
    color: T.TEXT,
    fontSize: 17,
    fontFamily: T.FONT.bold,
    textAlign: 'center',
  },
  hero: {
    gap: 24,
    paddingVertical: 8,
  },
  headline: {
    fontSize: 46,
    fontFamily: T.FONT.bold,
    color: T.ACCENT_FG,
    lineHeight: 56,
    letterSpacing: -1.2,
  },
  description: {
    fontSize: 16,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 27,
  },
  highlights: {
    gap: 14,
    marginTop: 4,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: alpha(T.SECONDARY, 0.85),
  },
  highlightText: {
    fontSize: 15,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
    lineHeight: 22,
  },
  actions: {
    gap: 16,
  },
  primaryBtnWrap: {
    borderRadius: T.RADIUS.pill,
    height: 56,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontFamily: T.FONT.semibold,
    fontSize: 16,
    color: T.ACCENT_FG,
    letterSpacing: 0.2,
  },
  terms: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: 'rgba(255,255,255,0.48)',
  },
});
