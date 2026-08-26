/**
 * Deep-link resolver for direct short links (meetsweet://short/:id or
 * https://meetsweet.space/short/:id).
 *
 * The URL path `/short/:id` is intentionally distinct from the shorts feed
 * route `/shorts`, so this thin screen bridges the link to the feed with the
 * target short as the start item.
 */
import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ShortDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return <Redirect href="/shorts" />;
  return <Redirect href={{ pathname: '/shorts', params: { startId: id } }} />;
}
