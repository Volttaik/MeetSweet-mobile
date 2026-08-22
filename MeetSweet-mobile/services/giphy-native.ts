import { Platform } from 'react-native';
import {
  GiphySDK,
  type GiphyMedia,
} from '@giphy/react-native-sdk';
import { File, Paths } from 'expo-file-system';

export type NativeGiphyKind = 'gif' | 'sticker';

export interface NativeGiphyPick {
  kind: NativeGiphyKind;
  giphyId: string;
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

let configured = false;

/**
 * Configure the native SDK once per JS runtime. The Android/iOS SDK key is
 * intentionally a public mobile credential; it is not the server GIPHY API
 * key used by the retired HTTP proxy.
 */
export function configureNativeGiphy(): boolean {
  if (Platform.OS === 'web') return false;
  if (configured) return true;

  const apiKey = Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_GIPHY_ANDROID_SDK_KEY
    : process.env.EXPO_PUBLIC_GIPHY_IOS_SDK_KEY;
  if (!apiKey) return false;

  GiphySDK.configure({ apiKey });
  configured = true;
  return true;
}

function firstAsset(media: GiphyMedia): { url: string; width?: number; height?: number } | null {
  const images = media.data?.images as unknown as Record<string, { url?: string; width?: string | number; height?: string | number }> | undefined;
  const asset = images?.original ?? images?.downsized ?? images?.fixed_width ?? images?.fixed_width_small;
  if (!asset?.url) return null;
  return {
    url: asset.url,
    width: asset.width == null ? undefined : Number(asset.width),
    height: asset.height == null ? undefined : Number(asset.height),
  };
}

function extensionFor(kind: NativeGiphyKind, url: string): string {
  const path = url.split('?')[0].toLowerCase();
  const match = path.match(/\.([a-z0-9]{2,5})$/);
  if (match?.[1] === 'gif' || match?.[1] === 'png' || match?.[1] === 'webp') return match[1];
  return kind === 'gif' ? 'gif' : 'png';
}

/** Convert an SDK-selected media object into the shared attachment contract. */
export function nativeGiphyPick(
  media: GiphyMedia,
  kind: NativeGiphyKind,
): { remoteUrl: string; pick: Omit<NativeGiphyPick, 'uri' | 'fileSize'> } | null {
  const asset = firstAsset(media);
  if (!asset) return null;
  const extension = extensionFor(kind, asset.url);
  return {
    remoteUrl: asset.url,
    pick: {
      kind,
      giphyId: String(media.id),
      mimeType: extension === 'gif' ? 'image/gif' : extension === 'webp' ? 'image/webp' : 'image/png',
      fileName: `giphy_${String(media.id)}.${extension}`,
      width: asset.width,
      height: asset.height,
    },
  };
}

/** Download the selected rendition to a stable cache URI before optimistic send. */
export async function downloadNativeGiphy(
  remoteUrl: string,
  fileName: string,
): Promise<{ uri: string; fileSize?: number }> {
  if (Platform.OS === 'web') throw new Error('Native GIPHY media requires a custom development client.');
  const destination = new File(Paths.cache, fileName);
  if (destination.exists && destination.size > 0) {
    return { uri: destination.uri, fileSize: destination.size };
  }
  const file = await File.downloadFileAsync(remoteUrl, destination, { idempotent: true });
  return { uri: file.uri, fileSize: file.size > 0 ? file.size : undefined };
}
