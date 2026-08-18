/**
 * MsGlobalDialogs — global styled dialog service.
 *
 * ONE visual language for every confirmation / feedback / option picker in
 * the app, replacing default system Alerts. Mount <MsGlobalDialogsHost />
 * once in the root layout, then call from anywhere:
 *
 *   dialogs.confirm({ title, message, confirmLabel, destructive, onConfirm })
 *   dialogs.alert({ variant, title, message, confirmLabel, onClose })
 *   dialogs.options({ title, actions: [{ label, destructive, onPress }] })
 *
 * The host reuses the app's established styled components (MsConfirmDialog,
 * MsFeedbackModal, MsActionSheet) so there is exactly one visual language.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MsConfirmDialog } from '@/components/MsConfirmDialog';
import { MsFeedbackModal, type FeedbackVariant } from '@/components/MsFeedbackModal';
import { MsActionSheet, type ActionItem } from '@/components/MsActionSheet';
import { MsCreatorGateSheet } from '@/components/MsCreatorGateSheet';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive treatment. */
  destructive?: boolean;
  /** Runs after the user confirms (dialog closes first). */
  onConfirm?: () => void;
}

export interface AlertOptions {
  variant?: FeedbackVariant;
  title: string;
  message?: string;
  confirmLabel?: string;
  onClose?: () => void;
}

export interface OptionsSheetOptions {
  title?: string;
  actions: ActionItem[];
}

export interface CreatorGateOptions {
  message?: string;
  /** Runs after the server confirms the account is now a creator. */
  onSuccess?: () => void;
}

type ConfirmHandler = (options: ConfirmOptions) => void;
type AlertHandler = (options: AlertOptions) => void;
type SheetHandler = (options: OptionsSheetOptions) => void;
type CreatorGateHandler = (options: CreatorGateOptions) => void;

let confirmHandler: ConfirmHandler | null = null;
let alertHandler: AlertHandler | null = null;
let sheetHandler: SheetHandler | null = null;
let creatorGateHandler: CreatorGateHandler | null = null;

/** Global entry points — safe no-ops until the host is mounted. */
export const dialogs = {
  confirm: (options: ConfirmOptions) => confirmHandler?.(options),
  alert: (options: AlertOptions) => alertHandler?.(options),
  options: (options: OptionsSheetOptions) => sheetHandler?.(options),
  creatorGate: (options: CreatorGateOptions) => creatorGateHandler?.(options),
};

interface PendingConfirm extends ConfirmOptions { key: number }
interface PendingAlert extends AlertOptions { key: number }

export function MsGlobalDialogsHost() {
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [alertState,   setAlertState]   = useState<PendingAlert | null>(null);
  const [sheetState,   setSheetState]   = useState<OptionsSheetOptions | null>(null);
  const [gateState,    setGateState]    = useState<CreatorGateOptions | null>(null);

  useEffect(() => {
    confirmHandler = (o) => setConfirmState({ ...o, key: Date.now() });
    alertHandler   = (o) => setAlertState({ ...o, key: Date.now() });
    sheetHandler   = (o) => setSheetState(o);
    creatorGateHandler = (o) => setGateState(o);
    return () => {
      confirmHandler = null;
      alertHandler   = null;
      sheetHandler   = null;
      creatorGateHandler = null;
    };
  }, []);

  const dismissConfirm = useCallback(() => setConfirmState(null), []);
  const dismissAlert   = useCallback(() => setAlertState(null), []);
  const dismissSheet   = useCallback(() => setSheetState(null), []);

  return (
    <>
      {confirmState ? (
        <MsConfirmDialog
          key={confirmState.key}
          visible
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          destructive={confirmState.destructive}
          onConfirm={() => {
            const onConfirm = confirmState.onConfirm;
            setConfirmState(null);
            onConfirm?.();
          }}
          onCancel={dismissConfirm}
        />
      ) : null}

      {alertState ? (
        <MsFeedbackModal
          key={alertState.key}
          visible
          variant={alertState.variant ?? 'info'}
          title={alertState.title}
          message={alertState.message}
          confirmLabel={alertState.confirmLabel}
          onClose={() => {
            const onClose = alertState.onClose;
            setAlertState(null);
            onClose?.();
          }}
        />
      ) : null}

      {sheetState ? (
        <MsActionSheet
          visible
          title={sheetState.title}
          actions={sheetState.actions}
          onClose={dismissSheet}
        />
      ) : null}

      {gateState ? (
        <MsCreatorGateSheet
          visible
          message={gateState.message}
          onClose={() => setGateState(null)}
          onSuccess={() => {
            const onSuccess = gateState.onSuccess;
            setGateState(null);
            onSuccess?.();
          }}
        />
      ) : null}
    </>
  );
}
