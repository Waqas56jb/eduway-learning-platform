import Constants from 'expo-constants';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Logo } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Small brand footer: logo, version and tagline. */
export const AppVersion = memo(function AppVersion() {
  const { t } = useI18n('settings');
  return (
    <View style={styles.root} accessible accessibilityLabel={t('about.version', { version: APP_VERSION })}>
      <Logo size={36} variant="gold" />
      <Text variant="label" color="muted" align="center" tabular>
        {t('about.version', { version: APP_VERSION })}
      </Text>
      <Text variant="caption" color="muted" align="center">
        {t('about.madeIn')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
});
