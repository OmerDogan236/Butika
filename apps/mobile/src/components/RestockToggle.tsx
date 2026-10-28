import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { type SavedProduct, useRestockAlert } from '../api/queries';
import { trackRestockAlertToggled } from '../lib/analytics';
import { ApiError } from '../lib/api';
import { restockControl, restockErrorKey, restockLabelKey } from '../lib/restock';
import { theme } from '../theme';
import type { ToastTone } from './Toast';

/**
 * Turns a saved size's stock alert on or off and reports the outcome in a toast.
 * sourceScreen: where the control is (webview / saved), for restock_alert_toggled.
 */
export function useRestockToggle(
  showToast: (message: string, tone?: ToastTone) => void,
  sourceScreen: string,
) {
  const { t } = useTranslation();
  const mutation = useRestockAlert();
  const code = (error: Error) => (error instanceof ApiError ? error.code : undefined);
  const failed = (error: Error) => showToast(t(restockErrorKey(code(error))), 'error');
  const track = (on: boolean, via: 'toggle' | 'size_picker', result: string, boutiqueId?: string) =>
    trackRestockAlertToggled({ on, via, sourceScreen, result, boutiqueId });
  return {
    pending: mutation.isPending,
    toggle: (item: SavedProduct) => {
      const on = restockControl(item.tracking, item.restockAlert) === 'notify';
      mutation.mutate({ id: item.id, on }, {
        onSuccess: ({ restockAlert }) => {
          track(on, 'toggle', 'ok', item.boutiqueId);
          showToast(t(restockAlert === 'off' ? 'saved.restockOff' : 'saved.restockOn'));
        },
        onError: (error) => {
          track(on, 'toggle', code(error) ?? 'error', item.boutiqueId);
          failed(error);
        },
      });
    },
    /** After saving from the size picker's bell. */
    arm: (savedId: string, doneMessage: string, boutiqueId?: string) => mutation.mutate({ id: savedId, on: true }, {
      onSuccess: () => {
        track(true, 'size_picker', 'ok', boutiqueId);
        showToast(doneMessage);
      },
      onError: (error) => {
        track(true, 'size_picker', code(error) ?? 'error', boutiqueId);
        failed(error);
      },
    }),
  };
}

/** "Stok gelince haber ver" for a sold-out saved size; tapping an existing alert turns it off. */
export function RestockToggle({ item, onPress, disabled, centered }: {
  item: SavedProduct;
  onPress: () => void;
  disabled?: boolean;
  centered?: boolean;
}) {
  const { t } = useTranslation();
  const control = restockControl(item.tracking, item.restockAlert);
  if (!control) return null;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} hitSlop={8} onPress={onPress}
      style={({ pressed }) => [styles.row, centered && styles.centered, pressed && { opacity: 0.6 }]}>
      <Ionicons name={control === 'notify' ? 'notifications-outline' : 'notifications'} size={14} color={theme.colors.gold} />
      <Text style={styles.label}>{t(restockLabelKey[control])}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  centered: { justifyContent: 'center' },
  label: { ...theme.type.caption, color: theme.colors.gold },
});
