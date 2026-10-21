import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Button, Card, Divider, ProgressBar, Text } from '@/components/ui';
import { weakTopics } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { space, subjectColors, useTheme } from '@/theme';

/** Weakest topics with accuracy bars and a shortcut to review the lesson. */
export const WeakTopics = memo(function WeakTopics() {
  const { colors } = useTheme();
  const { t, L } = useI18n('progress');

  return (
    <Card padded={false}>
      {weakTopics.map((w, i) => {
        const tone = w.accuracy < 55 ? colors.danger : colors.warning;
        const topic = L(w.topic);
        return (
          <Animated.View key={w.lessonId} entering={FadeInDown.duration(300).delay(i * 50)}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <View style={styles.titleRow}>
                  <View style={[styles.dot, { backgroundColor: subjectColors[w.subjectId] }]} />
                  <Text variant="caption" color="muted" numberOfLines={1}>
                    {t(`common:subjects.${w.subjectId}`)}
                  </Text>
                </View>
                <Text variant="bodyMedium" numberOfLines={2}>
                  {topic}
                </Text>
                <View style={styles.barRow}>
                  <View style={styles.flex}>
                    <ProgressBar progress={w.accuracy} color={tone} height={6} />
                  </View>
                  <Text variant="label" color={tone} tabular>
                    {t('weak.accuracy', { value: w.accuracy })}
                  </Text>
                </View>
              </View>
              <Button
                title={t('weak.review')}
                variant="outline"
                size="sm"
                onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: w.lessonId } })}
                accessibilityLabel={t('weak.reviewA11y', { topic })}
              />
            </View>
          </Animated.View>
        );
      })}
    </Card>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
