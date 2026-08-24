import { useEffect, useRef } from 'react';
import {
  GiphyContentType,
  GiphyDialog,
  GiphyDialogEvent,
  GiphyThemePreset,
} from '@giphy/react-native-sdk';
import {
  configureNativeGiphy,
  downloadNativeGiphy,
  nativeGiphyPick,
  type NativeGiphyKind,
  type NativeGiphyPick,
} from '@/services/giphy-native';

export interface GiphyPickResult extends NativeGiphyPick {}

interface Props {
  visible: boolean;
  kind?: NativeGiphyKind;
  onClose: () => void;
  onPick: (result: GiphyPickResult) => void;
}

/**
 * Thin bridge around the official native GIPHY Dialog. The SDK owns the
 * searchable/trending UI and returns a GIPHY media object; this component only
 * converts the selected rendition into MeetSweet's attachment contract.
 *
 * Supports GIFs and animated stickers (kind 'sticker'). Sticker renditions
 * are animated WebP — they render through expo-image, which decodes animated
 * WebP natively.
 */
export function MsGifPicker({ visible, kind = 'gif', onClose, onPick }: Props) {
  const kindRef = useRef(kind);
  const closeRef = useRef(onClose);
  const pickRef = useRef(onPick);

  useEffect(() => { kindRef.current = kind; }, [kind]);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    if (!visible || !configureNativeGiphy()) return;

    const listener = GiphyDialog.addListener(
      GiphyDialogEvent.MediaSelected,
      (event) => {
        const selected = nativeGiphyPick(event.media, kindRef.current);
        if (!selected) {
          closeRef.current();
          return;
        }
        void downloadNativeGiphy(selected.remoteUrl, selected.pick.fileName)
          .then((local) => {
            pickRef.current({
              ...selected.pick,
              uri: local.uri,
              fileSize: local.fileSize,
            });
            GiphyDialog.hide();
          })
          .catch(() => closeRef.current());
      },
    );
    const dismissed = GiphyDialog.addListener(GiphyDialogEvent.Dismissed, () => {
      closeRef.current();
    });
    return () => {
      listener.remove();
      dismissed.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !configureNativeGiphy()) return;
    // Both tabs are always available in the dialog; `selectedContentType`
    // opens on the tab the caller asked for (GIF vs Sticker).
    GiphyDialog.configure({
      mediaTypeConfig: [GiphyContentType.Gif, GiphyContentType.Sticker],
      selectedContentType: kind === 'sticker' ? GiphyContentType.Sticker : GiphyContentType.Gif,
      theme: GiphyThemePreset.Dark,
      showConfirmationScreen: false,
      showSuggestionsBar: true,
      showCheckeredBackground: false,
    });
    GiphyDialog.show();
  }, [visible, kind]);

  return null;
}
