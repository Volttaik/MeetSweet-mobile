/**
 * MsOnboardingModal — Reusable onboarding flow modal for MeetSweet.
 * Glass-card design: frosted dark card, white text, no pink accent.
 * Supports optional per-screen images.
 *
 * Usage:
 * <MsOnboardingModal
 *   visible={showOnboarding}
 *   screens={[
 *     { title: 'Welcome', subtitle: '...', icon: 'confetti', imageUrl: require('../assets/...') },
 *   ]}
 *   onComplete={handleComplete}
 * />
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  ArrowRight,
  Bank,
  Confetti,
  CurrencyCircleDollar,
  Gear,
  Globe,
  HandPointing,
  Image as ImageIcon,
  Lightning,
  Money,
  PiggyBank,
  Rocket,
  Shield,
  ShoppingCart,
  Star,
  TextAa,
  Trophy,
  VideoCamera,
  Wallet,
} from 'phosphor-react-native';
import { T } from '@/constants/theme';

export interface OnboardingScreen {
  title: string;
  subtitle: string;
  icon: OnboardingIcon;
  /** Optional button label (defaults to "Continue") */
  buttonLabel?: string;
  /** If true, shows warning that this step cannot be skipped */
  mandatory?: boolean;
  /** Optional secondary button text */
  secondaryLabel?: string;
  /** Optional image to display at top of card (require() source or {uri: string}) */
  imageSource?: number | { uri: string };
}

export type OnboardingIcon =
  | 'confetti'
  | 'rocket'
  | 'wallet'
  | 'money'
  | 'star'
  | 'video'
  | 'image'
  | 'globe'
  | 'shield'
  | 'gear'
  | 'trophy'
  | 'piggy'
  | 'bank'
  | 'lightning'
  | 'text'
  | 'cart'
  | 'hand';

const ICON_MAP: Record<OnboardingIcon, React.ComponentType<{ size: number; color: string; weight?: 'fill' | 'regular' | 'bold' | 'duotone' }>> = {
  confetti: Confetti,
  rocket: Rocket,
  wallet: Wallet,
  money: CurrencyCircleDollar,
  star: Star,
  video: VideoCamera,
  image: ImageIcon,
  globe: Globe,
  shield: Shield,
  gear: Gear,
  trophy: Trophy,
  piggy: PiggyBank,
  bank: Bank,
  lightning: Lightning,
  text: TextAa,
  cart: ShoppingCart,
  hand: HandPointing,
};

interface MsOnboardingModalProps {
  visible: boolean;
  screens: OnboardingScreen[];
  onComplete: () => void;
  /** If provided, shows a "Skip" button */
  onSkip?: () => void;
  /** Custom primary button action */
  onPrimaryAction?: () => void | Promise<void>;
  /** If true, shows spinner and disables buttons */
  loading?: boolean;
}

export function MsOnboardingModal({
  visible,
  screens,
  onComplete,
  onSkip,
  onPrimaryAction,
  loading = false,
}: MsOnboardingModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentScreen = screens[currentIndex];
  const isLastScreen = currentIndex === screens.length - 1;
  if (!currentScreen) return null;
  const IconComp = ICON_MAP[currentScreen.icon] ?? Star;
  const hasImage = !!currentScreen.imageSource;

  const handleNext = async () => {
    if (loading) return;
    if (onPrimaryAction) await onPrimaryAction();
    if (isLastScreen) {
      onComplete();
      setCurrentIndex(0);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
      setCurrentIndex(0);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable style={styles.backdrop} onPress={() => {}} />

        <Animated.View
          key={currentIndex}
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(180)}
          style={styles.card}
        >
          {/* Image (full-width at top, clipped to card radius) */}
          {hasImage && (
            <Image
              source={currentScreen.imageSource as any}
              style={styles.heroImage}
              resizeMode="cover"
            />
          )}

          <View style={styles.body}>
            {/* Progress dots */}
            <View style={styles.progressRow}>
              {screens.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === currentIndex && styles.dotActive]}
                />
              ))}
            </View>

            {/* Icon (shown when no image) */}
            {!hasImage && (
              <View style={styles.iconWrap}>
                <IconComp size={44} color="#fff" weight="duotone" />
              </View>
            )}

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.title}>{currentScreen.title}</Text>
              <Text style={styles.subtitle}>{currentScreen.subtitle}</Text>
            </View>

            {/* Warning for mandatory steps */}
            {currentScreen.mandatory && (
              <View style={styles.warningRow}>
                <Trophy size={14} color="#FFB700" />
                <Text style={styles.warningText}>You cannot skip this step</Text>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.buttonRow}>
              {onSkip && !currentScreen.mandatory && (
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={handleSkip}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipLabel}>Skip</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, !onSkip && styles.primaryBtnFull]}
                onPress={handleNext}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#0C0C0F" />
                ) : (
                  <>
                    <Text style={styles.primaryLabel}>
                      {currentScreen.buttonLabel ?? (isLastScreen ? 'Get Started' : 'Continue')}
                    </Text>
                    {!isLastScreen && (
                      <ArrowRight size={16} color="#0C0C0F" weight="bold" />
                    )}
                  </>
                )}
              </TouchableOpacity>
            </View>

            {currentScreen.secondaryLabel && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => {}} activeOpacity={0.7}>
                <Text style={styles.secondaryLabel}>{currentScreen.secondaryLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    // Glass card: very dark, slight transparency, crisp white border
    backgroundColor: 'rgba(22, 22, 26, 0.97)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
    elevation: 24,
  },
  heroImage: {
    width: '100%',
    height: 190,
  },
  body: {
    padding: 24,
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 22,
    borderRadius: 4,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  content: {
    alignItems: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: 'rgba(255, 255, 255, 0.62)',
    textAlign: 'center',
    lineHeight: 22,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 183, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: T.RADIUS.md,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 12,
    fontFamily: T.FONT.medium,
    color: '#FFB700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: T.RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  skipLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
    borderRadius: T.RADIUS.lg,
    // Solid white button — crisp contrast on glass card
    backgroundColor: '#FFFFFF',
  },
  primaryBtnFull: {
    flex: 1,
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: '#0C0C0F',
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 10,
  },
  secondaryLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
  },
});
