import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MsPressable } from '@/components/MsPressable';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Sparkle, Wallet, CheckCircle } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsScreenBackground } from '@/components/MsScreenBackground';
import { MsCreatorCard, type MsCreatorCardData } from '@/components/MsCreatorCard';
import { getCreators } from '@/services/creators';
import { subscribe } from '@/services/subscriptions';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboarding } from '@/services/onboarding';
import * as Haptics from 'expo-haptics';

export default function NewUserWelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { balance, refreshWallet } = useWalletBalance();

  const [creators, setCreators] = useState<MsCreatorCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  // Insufficient balance modal / banner state
  const [insufficientModal, setInsufficientModal] = useState<{
    visible: boolean;
    creatorName: string;
    requiredPrice: number;
  }>({ visible: false, creatorName: '', requiredPrice: 0 });

  // 1. Fetch real creators from backend endpoint (capped at 20)
  const fetchTopCreators = useCallback(async () => {
    setError(null);
    try {
      const realCreators = await getCreators();
      // Cap strictly at top 20 real creators
      const top20 = (realCreators || []).slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name || c.username || 'Creator',
        handle: c.username ? `@${c.username}` : '@creator',
        bio: c.bio || undefined,
        category: c.category ?? undefined,
        subscriberCount: c.subscriberCount ? `${c.subscriberCount}` : undefined,
        subscriptionPrice: c.subscriptionPrice,
        isOnline: c.isOnline,
        isVerified: c.isVerified,
        avatarUrl: c.avatarUrl,
      }));
      setCreators(top20);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load creators. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTopCreators();
  }, [fetchTopCreators]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTopCreators();
  };

  // 2. Handle Subscribe action using real wallet & subscription system
  const handleSubscribe = async (creator: MsCreatorCardData) => {
    const price = creator.subscriptionPrice ?? 0;
    // Check wallet balance
    if (balance < price) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
      setInsufficientModal({
        visible: true,
        creatorName: creator.name,
        requiredPrice: price,
      });
      return;
    }

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setSubscribingId(creator.id);
    try {
      await subscribe(creator.id, 'subscriber');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setSubscribedIds((prev) => new Set(prev).add(creator.id));
      await refreshWallet();
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('fund') || msg.includes('balance') || msg.includes('insufficient')) {
        setInsufficientModal({
          visible: true,
          creatorName: creator.name,
          requiredPrice: price,
        });
      } else {
        setError(err?.message || 'Subscription failed. Please try again.');
      }
    } finally {
      setSubscribingId(null);
    }
  };

  // 3. Mark new user recommendation flow complete & proceed into main app
  const handleContinueToApp = async () => {
    await completeOnboarding('creator_onboarded');
    router.replace('/(tabs)');
  };

  return (
    <MsScreenBackground>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <View style={styles.welcomeBadge}>
              <Sparkle size={14} color={T.ACCENT} weight="fill" />
              <Text style={styles.welcomeBadgeText}>NEW TO MEETSWEET</Text>
            </View>
          </View>
          <Text style={styles.title}>
            Welcome to MeetSweet{user?.name ? `, ${user.name.split(' ')[0]}!` : '!'}
          </Text>
          <Text style={styles.subtitle}>
            Explore top creators below and subscribe to start building your personalized feed.
          </Text>
        </View>

        {/* Content area */}
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={T.ACCENT} />
            <Text style={styles.loadingText}>Loading top creators…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Oops, couldn't load creators</Text>
            <Text style={styles.errorSub}>{error}</Text>
            <MsPressable style={styles.retryBtn} onPress={handleRefresh}>
              <Text style={styles.retryLabel}>Try Again</Text>
            </MsPressable>
          </View>
        ) : creators.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>No creators found</Text>
            <Text style={styles.errorSub}>Check back soon for featured creators!</Text>
          </View>
        ) : (
          <FlatList
            data={creators}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.ACCENT} />
            }
            renderItem={({ item }) => {
              const isSubscribed = subscribedIds.has(item.id);
              const isBusy = subscribingId === item.id;

              return (
                <View style={styles.cardContainer}>
                  <MsCreatorCard
                    creator={item}
                    variant="featured"
                    onPress={() => router.push(`/creator/${item.id}`)}
                    onSubscribe={isSubscribed ? undefined : () => handleSubscribe(item)}
                  />
                  {/* Overlay button state override for subscribed / loading */}
                  {isSubscribed ? (
                    <View style={styles.subscribedBadge}>
                      <CheckCircle size={14} color={T.SUCCESS} weight="fill" />
                      <Text style={styles.subscribedText}>Subscribed</Text>
                    </View>
                  ) : isBusy ? (
                    <View style={styles.busyBadge}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )}

        {/* Footer CTA */}
        <View style={styles.footer}>
          <MsPressable style={styles.continueBtn} onPress={handleContinueToApp}>
            <Text style={styles.continueBtnLabel}>Explore Feed</Text>
            <ArrowRight size={18} color={T.BG} weight="bold" />
          </MsPressable>
        </View>

        {/* Insufficient Funds Modal */}
        {insufficientModal.visible && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <Wallet size={32} color={T.ACCENT} weight="duotone" />
              </View>
              <Text style={styles.modalTitle}>Fund Your Wallet</Text>
              <Text style={styles.modalBody}>
                You need at least ₦{insufficientModal.requiredPrice.toLocaleString()} in your wallet to subscribe to{' '}
                <Text style={styles.highlightText}>{insufficientModal.creatorName}</Text>. Current balance: ₦
                {balance.toLocaleString()}.
              </Text>
              <MsPressable
                style={styles.fundBtn}
                           onPress={() => {
                  setInsufficientModal({ visible: false, creatorName: '', requiredPrice: 0 });
                  router.push('/wallet');
                }}
              >
                <Wallet size={18} color={T.BG} />
                <Text style={styles.fundBtnLabel}>Go to Wallet & Add Funds</Text>
              </MsPressable>
              <MsPressable
                style={styles.cancelBtn}
                           onPress={() => setInsufficientModal({ visible: false, creatorName: '', requiredPrice: 0 })}
              >
                <Text style={styles.cancelBtnLabel}>Cancel</Text>
              </MsPressable>
            </View>
          </View>
        )}
      </View>
    </MsScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  welcomeBadgeText: {
    fontSize: 10,
    fontFamily: T.FONT.semibold,
    color: T.ACCENT,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 26,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    lineHeight: 21,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  errorSub: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_3,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.SURFACE_2,
  },
  retryLabel: {
    fontSize: 13,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },

  listContent: {
    paddingBottom: 20,
    gap: 14,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  cardContainer: {
    position: 'relative',
  },
  subscribedBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    height: 30,
    borderRadius: T.RADIUS.pill,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: T.SUCCESS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subscribedText: {
    fontSize: 11,
    fontFamily: T.FONT.semibold,
    color: T.SUCCESS,
  },
  busyBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    height: 30,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    paddingTop: 8,
  },
  continueBtn: {
    height: 52,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...T.SHADOWS.medium,
  },
  continueBtnLabel: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },

  // Insufficient modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    backgroundColor: T.SURFACE,
    borderRadius: T.RADIUS.xl,
    borderWidth: 1,
    borderColor: T.BORDER_2,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    ...T.SHADOWS.medium,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: T.FONT.bold,
    color: T.TEXT,
  },
  modalBody: {
    fontSize: 13,
    fontFamily: T.FONT.regular,
    color: T.TEXT_2,
    textAlign: 'center',
    lineHeight: 20,
  },
  highlightText: {
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  fundBtn: {
    width: '100%',
    height: 48,
    borderRadius: T.RADIUS.pill,
    backgroundColor: T.TEXT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  fundBtnLabel: {
    fontSize: 14,
    fontFamily: T.FONT.semibold,
    color: T.BG,
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnLabel: {
    fontSize: 13,
    fontFamily: T.FONT.medium,
    color: T.TEXT_3,
  },
});
