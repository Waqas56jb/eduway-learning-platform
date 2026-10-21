import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { ProgressRing, Text } from '@/components/ui';
import { lessons, subjects } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { gradients, palette, radius, shadows, space } from '@/theme';
import { formatNumber } from '@/utils/format';

/** Navy hero strip on the Subjects tab: overall completion ring + totals. */
export function SubjectsSummary() {
  const { t, lang } = useI18n('subjects');
  const overall = useProgressStore((s) => s.subjectCompletion());
  const completed = useProgressStore((s) => s.completedCount());
  const hours = subjects.reduce((acc, s) => acc + s.hours, 0);

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.wrap, shadows.lg]}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} />
      <View style={styles.top}>
        <ProgressRing
          progress={overall}
          size={76}
          strokeWidth={7}
          color={palette.gold}
          trackColor="rgba(255,255,255,0.12)"
          label={`${overall}%`}
        />
        <View style={styles.topText}>
          <Text variant="overline" color={palette.goldLight}>
            {t('summary.overall')}
          </Text>
          <Text variant="h2" display color="#FFFFFF">
            {`${overall}%`}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={2}>
            {t('summary.keepGoing')}
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat icon="lesson" value={formatNumber(lessons.length, lang)} label={t('summary.lessons')} />
        <View style={styles.sep} />
        <Stat icon="check-circle" value={formatNumber(completed, lang)} label={t('summary.completed')} />
        <View style={styles.sep} />
        <Stat icon="clock" value={formatNumber(hours, lang)} label={t('summary.hours')} />
      </View>
    </Animated.View>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Icon name={icon} size={15} color={palette.gold} />
        <Text variant="h3" color="#FFFFFF" tabular>
          {value}
        </Text>
      </View>
      <Text variant="caption" color="rgba(255,255,255,0.68)" numberOfLines={1} align="center">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.lg },
  glow: {
    position: 'absolute',
    top: -60,
    end: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(201,162,74,0.14)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  topText: { flex: 1, gap: 2 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sep: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: 'rgba(255,255,255,0.16)' },
});
