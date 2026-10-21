import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { Card, Text } from '@/components/ui';
import { recentActivity } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme, type ThemeColors } from '@/theme';
import { timeAgo } from '@/utils/format';

type Kind = (typeof recentActivity)[number]['kind'];

const KIND_ICON: Record<Kind, IconName> = { lesson: 'lesson', quiz: 'quiz', exam: 'exam', ai: 'sparkles' };

const kindColors = (c: ThemeColors): Record<Kind, { fg: string; bg: string }> => ({
  lesson: { fg: c.info, bg: c.infoSoft },
  quiz: { fg: c.accent, bg: c.accentSoft },
  exam: { fg: c.success, bg: c.successSoft },
  ai: { fg: '#8B5CF6', bg: 'rgba(139,92,246,0.14)' },
});

const NODE = 40;

/** Vertical timeline of the student's latest activity. */
export const ActivityTimeline = memo(function ActivityTimeline() {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('progress');
  const palette = kindColors(colors);

  return (
    <Card>
      {recentActivity.map((a, i) => {
        const tone = palette[a.kind];
        const last = i === recentActivity.length - 1;
        return (
          <Animated.View key={a.id} entering={FadeInDown.duration(300).delay(i * 60)} style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.node, { backgroundColor: tone.bg }]}>
                <Icon name={KIND_ICON[a.kind]} size={18} color={tone.fg} />
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
            </View>
            <View style={[styles.body, !last && styles.bodySpacing]}>
              <View style={styles.metaRow}>
                <Text variant="overline" color={tone.fg} numberOfLines={1}>
                  {t(`activity.kinds.${a.kind}`)}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {timeAgo(a.date, lang)}
                </Text>
              </View>
              <Text variant="bodyMedium" numberOfLines={2}>
                {L(a.title)}
              </Text>
              <Text variant="caption" color="muted" numberOfLines={1}>
                {L(a.meta)}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </Card>
  );
});

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space.md },
  rail: { width: NODE, alignItems: 'center' },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, borderRadius: 1, marginVertical: space.xs },
  body: { flex: 1, gap: 2, paddingTop: 2 },
  bodySpacing: { paddingBottom: space.lg },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
});
