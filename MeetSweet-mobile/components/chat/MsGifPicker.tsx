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
 * GIF and sticker dialogs are deliberately configured with different content
 * types. This component never opens the device emoji keyboard or image picker.
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
    GiphyDialog.configure({
      mediaTypeConfig: [kind === 'gif' ? GiphyContentType.Gif : GiphyContentType.Sticker],
      selectedContentType: kind === 'gif' ? GiphyContentType.Gif : GiphyContentType.Sticker,
      theme: GiphyThemePreset.Dark,
      showConfirmationScreen: false,
      showSuggestionsBar: true,
      showCheckeredBackground: kind === 'sticker',
    });
    GiphyDialog.show();
  }, [visible, kind]);

  return null;
}
