import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Divider, ListRow, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';

export interface SupportSheetProps {
  visible: boolean;
  onClose: () => void;
}

const WHATSAPP_GREEN = '#25D366';

/** Bottom sheet listing the support channels (mock — shows a toast instead of leaving the app). */
export const SupportSheet = memo(function SupportSheet({ visible, onClose }: SupportSheetProps) {
  const { t } = useI18n('settings');
  const phone = `⁦${t('support.phoneNumber')}⁩`;

  const open = useCallback(
    (channel: string) => {
      onClose();
      toast.show({ message: t('support.opening', { channel }), tone: 'info', icon: 'headset' });
    },
    [onClose, t],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('support.title')}>
      <Text variant="body" color="muted" style={styles.subtitle}>
        {t('support.subtitle')}
      </Text>
      <View>
        <ListRow
          icon="send"
          iconColor={WHATSAPP_GREEN}
          title={t('support.whatsapp')}
          subtitle={`${t('support.whatsappSub')} · ${phone}`}
          onPress={() => open(t('support.whatsapp'))}
        />
        <Divider />
        <ListRow
          icon="phone"
          title={t('support.phone')}
          subtitle={`${t('support.phoneSub')} · ${phone}`}
          onPress={() => open(t('support.phone'))}
        />
        <Divider />
        <ListRow
          icon="mail"
          title={t('support.email')}
          subtitle={`${t('support.emailSub')} · ${t('support.emailAddress')}`}
          onPress={() => open(t('support.email'))}
        />
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  subtitle: { marginBottom: space.md },
});
