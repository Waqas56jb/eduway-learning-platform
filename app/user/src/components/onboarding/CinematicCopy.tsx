import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui';
import { useLangStore } from '@/store/langStore';
import { space } from '@/theme';
import { Reveal } from './Reveal';
import { ink, parseHighlight, plainCopy } from './tokens';

/** Number of stagger steps a copy block uses (overline + each headline line + subtitle). */
export function copySteps(title: string, hasOverline = true) {
  return (hasOverline ? 1 : 0) + title.split('\n').length + 1;
}

/**
 * Typography-led message: gold overline → display headline (one line per `\n`, `*word*` in gold)
 * → soft subtitle. Each piece fades + rises in sequence whenever `active` becomes true.
 */
export const CinematicCopy = memo(function CinematicCopy({
  overline,
  title,
  subtitle,
  active,
  titleSize,
  align = 'start',
  delay = 120,
  orderOffset = 0,
  style,
}: {
  overline?: string;
  title: string;
  subtitle: string;
  active: boolean;
  titleSize: number;
  align?: 'start' | 'center';
  delay?: number;
  orderOffset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const isAr = useLangStore((s) => s.isAr);
  const lines = title.split('\n');
  // Tajawal is optically smaller and taller than Playfair: nudge size up, give it more leading.
  const size = isAr ? titleSize + 2 : titleSize;
  const titleStyle = {
    fontSize: size,
    lineHeight: Math.round(size * (isAr ? 1.36 : 1.14)),
    letterSpacing: isAr ? 0 : -0.6,
  };
  const center = align === 'center';
  let order = orderOffset;

  return (
    <View style={[center && styles.center, style]}>
      {overline ? (
        <Reveal active={active} order={order++} delay={delay}>
          <View style={[styles.overlineRow, center && styles.centerRow]}>
            <View style={styles.rule} />
            <Text
              variant="overline"
              color={ink.gold}
              align={align}
              style={[styles.overline, { letterSpacing: isAr ? 0 : 2.6 }]}
            >
              {overline}
            </Text>
          </View>
        </Reveal>
      ) : null}

      <View accessible accessibilityRole="header" accessibilityLabel={plainCopy(title)} style={center && styles.center}>
        {lines.map((line, i) => (
          <Reveal key={`${i}-${line}`} active={active} order={order++} delay={delay}>
            <Text variant="display" color={ink.white} align={align} style={titleStyle}>
              {parseHighlight(line).map((seg, j) =>
                seg.hi ? (
                  <Text key={j} variant="display" color={ink.goldHi} style={titleStyle}>
                    {seg.text}
                  </Text>
                ) : (
                  seg.text
                ),
              )}
            </Text>
          </Reveal>
        ))}
      </View>

      <Reveal active={active} order={order++} delay={delay}>
        <Text
          variant="body"
          color={ink.soft}
          align={align}
          style={[styles.subtitle, isAr ? styles.subtitleAr : styles.subtitleEn]}
        >
          {subtitle}
        </Text>
      </Reveal>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  overlineRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, marginBottom: space.md },
  centerRow: { justifyContent: 'center' },
  rule: { width: 22, height: 1.5, borderRadius: 1, backgroundColor: ink.gold },
  overline: { fontSize: 12, lineHeight: 16 },
  subtitle: { marginTop: space.md, maxWidth: 420 },
  subtitleEn: { fontSize: 16, lineHeight: 24 },
  subtitleAr: { fontSize: 16, lineHeight: 27 },
});
