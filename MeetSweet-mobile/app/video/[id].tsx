/**
 * Deep-link resolver for direct video links (meetsweet://video/:id or
 * https://meetsweet.space/video/:id).
 *
 * The URL path `/video/:id` is intentionally distinct from the player route
 * `/videos/:id`, so this thin screen bridges the link to the real destination.
 */
import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VideoDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return <Redirect href="/videos" />;
  return <Redirect href={`/videos/${id}`} />;
}
