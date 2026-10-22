import { memo, useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { submitSupportMessage, useAppConfig, type ContactSubject } from '@/api';
import { BottomSheet, Button, Chip, Divider, Input, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { haptic } from '@/utils/haptics';
import { radius, space, useTheme } from '@/theme';
import { ROW_TEXT_INSET, SettingsRow } from './SettingsRow';

export interface SupportSheetProps {
  visible: boolean;
  onClose: () => void;
}

const WHATSAPP_GREEN = '#25D366';
const PHONE_BLUE = '#2563EB';
const MAIL_ORANGE = '#EA580C';
const TOPICS: ContactSubject[] = ['support', 'billing', 'general'];
const MIN_MESSAGE = 20;

/** Bottom sheet listing the support channels from `/public/app-config` (bundled copy as fallback). */
export const SupportSheet = memo(function SupportSheet({ visible, onClose }: SupportSheetProps) {
  const { t, L, lang } = useI18n('settings');
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

  // In-app message → support ticket (PUB-10), signed with the student's name and mobile.
  const user = useAuthStore((s) => s.user);
  const [topic, setTopic] = useState<ContactSubject>('support');
  const [message, setMessage] = useState('');
  const tooShort = message.trim().length < MIN_MESSAGE;
  const send = useMutation({
    mutationFn: () => {
      const name = (user ? L(user.name) : '').trim();
      return submitSupportMessage({
        name: name.length >= 3 ? name : user?.mobile ?? name,
        contact: user?.mobile ?? '',
        subject: topic,
        message: message.trim(),
        locale: lang,
      });
    },
    onSuccess: (res) => {
      haptic.success();
      setMessage('');
      onClose();
      toast.success(t('support.sent', { id: res.ticketId }));
    },
  });

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
      {user?.mobile ? (
        <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="bodyBold">{t('support.messageTitle')}</Text>
          <Text variant="caption" color="muted">
            {t('support.messageSub')}
          </Text>
          <View style={styles.topics}>
            {TOPICS.map((k) => (
              <Chip key={k} label={t(`support.topics.${k}`)} selected={topic === k} onPress={() => setTopic(k)} />
            ))}
          </View>
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder={t('support.messagePlaceholder')}
            hint={tooShort ? t('support.messageHint', { count: MIN_MESSAGE }) : undefined}
            multiline
            maxLength={4000}
            accessibilityLabel={t('support.messageTitle')}
          />
          <Button
            title={t('support.send')}
            icon="send"
            onPress={() => send.mutate()}
            loading={send.isPending}
            disabled={tooShort || send.isPending}
            fullWidth
          />
        </View>
      ) : null}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  subtitle: { marginBottom: space.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: space.sm },
  form: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
