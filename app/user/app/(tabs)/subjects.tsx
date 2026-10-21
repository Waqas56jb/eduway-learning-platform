import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/layout';
import { SubjectCard } from '@/components/student';
import { SubjectsSummary } from '@/components/subjects/SubjectsSummary';
import { Text } from '@/components/ui';
import { subjects } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';

export default function SubjectsScreen() {
  const { t } = useI18n('subjects');

  return (
    <Screen scroll tabBarSpace>
      <Animated.View entering={FadeInDown.duration(260)} style={styles.header}>
        <Text variant="overline" color="accent">
          {t('overline')}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text variant="body" color="muted">
          {t('subtitle')}
        </Text>
      </Animated.View>

      <SubjectsSummary />

      <View style={styles.list}>
        {subjects.map((subject, i) => (
          <SubjectCard key={subject.id} subject={subject} index={i + 1} variant="large" />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs, paddingTop: space.lg, paddingBottom: space.xl },
  list: { gap: space.lg, marginTop: space.xl },
});
