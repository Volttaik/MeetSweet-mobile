/**
 * MsOnboardingModal — Reusable onboarding flow modal for MeetSweet.
 * 
 * Usage:
 * <MsOnboardingModal
 *   visible={showOnboarding}
 *   screens={[
 *     { title: 'Welcome', subtitle: '...', icon: 'confetti' },
 *     { title: 'Get Started', subtitle: '...', icon: 'rocket' },
 *   ]}
 *   onComplete={handleComplete}
 *   onSkip={handleSkip} // optional, only if skip is allowed
 * />
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import {
  ArrowRight,
  Bank,
  Confetti,
  CurrencyCircleDollar,
  Gear,
  Globe,
  HandPointing,
  Image,
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
  image: Image,
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

  const handleNext = async () => {
    if (loading) return;
    
    if (onPrimaryAction) {
      await onPrimaryAction();
    }

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

  const handleComplete = () => {
    onComplete();
    setCurrentIndex(0);
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
          {/* Progress dots */}
          <View style={styles.progressRow}>
            {screens.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>

          {/* Icon */}
          <View style={styles.iconWrap}>
            <IconComp size={52} color={T.ACCENT} weight="duotone" />
          </View>

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
                <ActivityIndicator size="small" color={T.BG} />
              ) : (
                <>
                  <Text style={styles.primaryLabel}>
                    {currentScreen.buttonLabel ?? (isLastScreen ? 'Get Started' : 'Continue')}
                  </Text>
                  {!isLastScreen && (
                    <ArrowRight size={16} color={T.BG} weight="bold" />
                  )}
                </>
              )}
            </TouchableOpacity>
          </View>

          {currentScreen.secondaryLabel && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {}}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryLabel}>{currentScreen.secondaryLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    padding: 28,
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.BORDER,
  },
  dotActive: {
    backgroundColor: T.ACCENT,
    width: 24,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: T.ACCENT_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  content: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 21,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 183, 0, 0.12)',
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
    gap: 12,
    width: '100%',
  },
  skipBtn: {
    flex: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: T.RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontSize: 14,
    fontFamily: T.FONT.medium,
    color: T.TEXT_2,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: T.RADIUS.lg,
    backgroundColor: T.ACCENT,
  },
  primaryBtnFull: {
    flex: 1,
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 10,
  },
  secondaryLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.ACCENT,
    textAlign: 'center',
  },
});
