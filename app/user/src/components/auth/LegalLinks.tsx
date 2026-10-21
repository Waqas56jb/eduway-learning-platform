import { router } from 'expo-router';
import { Text } from '@/components/ui';
import type { TypeVariant } from '@/theme';
import { useI18n } from '@/hooks/useI18n';

interface LegalLinksProps {
  /** Lead-in text, e.g. "By continuing you agree to our" / "I agree to the". */
  prefix: string;
  align?: 'start' | 'center';
  variant?: TypeVariant;
}

/** Inline sentence with tappable Terms of Service / Privacy Policy links. */
export function LegalLinks({ prefix, align = 'start', variant = 'caption' }: LegalLinksProps) {
  const { t } = useI18n('auth');
  return (
    <Text variant={variant} color="muted" align={align}>
      {`${prefix} `}
      <Text
        variant={variant}
        color="accent"
        style={{ textDecorationLine: 'underline' }}
        accessibilityRole="link"
        accessibilityLabel={t('legal.terms')}
        onPress={() => router.push('/legal/terms')}
      >
        {t('legal.terms')}
      </Text>
      {` ${t('legal.and')} `}
      <Text
        variant={variant}
        color="accent"
        style={{ textDecorationLine: 'underline' }}
        accessibilityRole="link"
        accessibilityLabel={t('legal.privacy')}
        onPress={() => router.push('/legal/privacy')}
      >
        {t('legal.privacy')}
      </Text>
      {t('legal.suffix')}
    </Text>
  );
}
