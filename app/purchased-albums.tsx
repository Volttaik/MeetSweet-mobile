/**
 * Purchased Albums — /purchased-albums
 *
 * Shows all albums the current user has bought (unlocked with wallet credits).
 * Tapping an album opens the full album detail screen.
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { T } from '@/constants/theme';
import { MsAmbientBackground } from '@/components/MsAmbientBackground';
import { MsEmptyState } from '@/components/MsEmptyState';
import { ExploreAlbumCard } from '@/components/ExploreAlbumCard';
import { usePurchasedAlbums } from '@/services/albums';

export default function PurchasedAlbumsScreen() {
  const insets = useSafeAreaInsets();
  const { data: albums, isLoading, isError, refetch } = usePurchasedAlbums();

  return (
    <View style={[styles.bg, { paddingTop: insets.top }]}>
      <MsAmbientBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={T.TEXT} />
        </TouchableOpacity>
        <Text style={styles.title}>Purchased Albums</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={T.ACCENT} />
        </View>
      ) : isError ? (
        <MsEmptyState
          title="Couldn't load albums"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : !albums || albums.length === 0 ? (
        <MsEmptyState
          title="No purchased albums"
          message="Albums you buy will appear here. Browse Explore to discover premium collections."
          actionLabel="Go to Explore"
          onAction={() => router.push('/(tabs)/explore')}
        />
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ExploreAlbumCard
              album={item}
              onPress={() => router.push(`/album/${item.id}`)}
              onCreatorPress={() =>
                router.push({ pathname: '/creator/[id]', params: { id: item.creatorId } })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: T.BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontFamily: T.FONT.semibold,
    color: T.TEXT,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
});
