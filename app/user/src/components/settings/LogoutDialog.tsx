import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { Dialog } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { haptic } from '@/utils/haptics';

export interface LogoutDialogProps {
  visible: boolean;
  onClose: () => void;
}

/** Confirm dialog that signs the student out and returns to the welcome screen. */
export const LogoutDialog = memo(function LogoutDialog({ visible, onClose }: LogoutDialogProps) {
  const { t } = useI18n('settings');

  const confirm = useCallback(async () => {
    onClose();
    haptic.warning();
    await useAuthStore.getState().logout();
    router.replace('/(auth)/welcome');
  }, [onClose]);

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      icon="logout"
      tone="danger"
      title={t('logout.title')}
      message={t('logout.message')}
      primaryLabel={t('logout.confirm')}
      onPrimary={() => void confirm()}
      secondaryLabel={t('common:actions.cancel')}
      onSecondary={onClose}
    />
  );
});
