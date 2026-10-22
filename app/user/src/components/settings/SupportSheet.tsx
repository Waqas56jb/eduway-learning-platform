import { memo, useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useAppConfig } from '@/api';
import { BottomSheet, Divider, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import { ROW_TEXT_INSET, SettingsRow } from './SettingsRow';

export interface SupportSheetProps {
  visible: boolean;
  onClose: () => void;
}

const WHATSAPP_GREEN = '#25D366';
const PHONE_BLUE = '#2563EB';
const MAIL_ORANGE = '#EA580C';

/** Bottom sheet listing the support channels from `/public/app-config` (bundled copy as fallback). */
export const SupportSheet = memo(function SupportSheet({ visible, onClose }: SupportSheetProps) {
  const { t, L } = useI18n('settings');
  const { colors } = useTheme();
  const support = useAppConfig().data?.support;
  const phoneRaw = support?.phone || t('support.phoneNumber');
  const whatsappRaw = support?.whatsapp || phoneRaw;
  const email = support?.email || t('support.emailAddress');
  const hours = support ? L(support.hours) : '';
  const phone = `⁦${phoneRaw}⁩`;
  const whatsapp = `⁦${whatsappRaw}⁩`;

  const open = useCallback(
    (channel: string, url: string) => {
      onClose();
      toast.show({ message: t('support.opening', { channel }), tone: 'info', icon: 'headset' });
      void Linking.openURL(url).catch(() => {});
    },
    [onClose, t],
  );

  const digits = (v: string) => v.replace(/[^\d+]/g, '');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('support.title')}>
      <Text variant="body" color="muted" style={styles.subtitle}>
        {hours || t('support.subtitle')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow
          icon="send"
          iconColor={WHATSAPP_GREEN}
          title={t('support.whatsapp')}
          subtitle={`${t('support.whatsappSub')} · ${whatsapp}`}
          onPress={() => open(t('support.whatsapp'), `https://wa.me/${digits(whatsappRaw).replace(/^\+/, '')}`)}
        />
        <Divider inset={ROW_TEXT_INSET} />
        <SettingsRow
          icon="phone"
          iconColor={PHONE_BLUE}
          title={t('support.phone')}
          subtitle={`${t('support.phoneSub')} · ${phone}`}
          onPress={() => open(t('support.phone'), `tel:${digits(phoneRaw)}`)}
        />
        <Divider inset={ROW_TEXT_INSET} />
        <SettingsRow
          icon="mail"
          iconColor={MAIL_ORANGE}
          title={t('support.email')}
          subtitle={`${t('support.emailSub')} · ${email}`}
          onPress={() => open(t('support.email'), `mailto:${email}`)}
        />
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  subtitle: { marginBottom: space.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: space.sm },
});
