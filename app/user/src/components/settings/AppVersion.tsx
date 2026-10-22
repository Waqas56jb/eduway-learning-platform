import Constants from 'expo-constants';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Logo } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Small brand footer: logo, wordmark, version and tagline. */
export const AppVersion = memo(function AppVersion() {
  const { t } = useI18n('settings');
  const { colors } = useTheme();
  const version = t('about.version', { version: APP_VERSION });
  return (
    <View style={styles.root} accessible accessibilityLabel={`EDUWAY. ${version}. ${t('about.madeIn')}`}>
      <Logo size={30} variant="gold" />
      <View style={styles.line}>
        <Text variant="label" color="ink" style={styles.brand}>
          EDUWAY
        </Text>
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <Text variant="label" color="muted" tabular>
          {version}
        </Text>
      </View>
      <Text variant="caption" color="muted" align="center">
        {t('about.madeIn')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.sm, paddingTop: space.sm, paddingBottom: space.xl, paddingHorizontal: space.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { letterSpacing: 1.6, writingDirection: 'ltr' },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
});
