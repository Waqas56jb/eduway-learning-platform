import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { QUALITIES, SPEEDS, type Quality } from './captions';

export interface SettingsMenuProps {
  speed: number;
  quality: Quality;
  onSpeed: (s: number) => void;
  onQuality: (q: Quality) => void;
  onClose: () => void;
  compact?: boolean;
}

export const formatSpeed = (s: number) => `${s}×`;

/** Small glass popover with playback speed + quality pickers (works inline and in fullscreen). */
export const SettingsMenu = memo(function SettingsMenu({ speed, quality, onSpeed, onQuality, onClose, compact }: SettingsMenuProps) {
  const { t } = useI18n('lesson');
  const qualityLabel = (q: Quality) => (q === 'auto' ? t('player.qualityAuto') : q);

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common:actions.close')} />
      <Animated.View entering={ZoomIn.duration(180)} style={[styles.panel, compact && styles.panelCompact]}>
        <Row icon="speed" label={t('player.speed')}>
          {SPEEDS.map((s) => (
            <Option
              key={s}
              label={formatSpeed(s)}
              selected={speed === s}
              accessibilityLabel={s === 1 ? t('player.normal') : formatSpeed(s)}
              onPress={() => onSpeed(s)}
            />
          ))}
        </Row>
        <View style={styles.sep} />
        <Row icon="gear-quality" label={t('player.quality')}>
          {QUALITIES.map((q) => (
            <Option key={q} label={qualityLabel(q)} selected={quality === q} accessibilityLabel={qualityLabel(q)} onPress={() => onQuality(q)} />
          ))}
        </Row>
      </Animated.View>
    </Animated.View>
  );
});

function Row({ icon, label, children }: { icon: 'speed' | 'gear-quality'; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Icon name={icon} size={14} color={palette.goldLight} />
        <Text variant="caption" color="rgba(255,255,255,0.8)">
          {label}
        </Text>
      </View>
      <View style={styles.options}>{children}</View>
    </View>
  );
}

function Option({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text variant="label" color={selected ? palette.navy : '#FFFFFF'} tabular style={styles.optionText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    end: space.md,
    bottom: 52,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(7,20,38,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: space.sm,
    maxWidth: 340,
  },
  panelCompact: { bottom: 44, padding: space.sm, gap: space.xs },
  row: { gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: {
    minWidth: 44,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  optionSelected: { backgroundColor: palette.gold },
  optionText: { writingDirection: 'ltr' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' },
});
