import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { Lang } from '@/types';
import { fonts, gradients, palette, radius, shadows, space, useTheme } from '@/theme';

export interface LanguageCardProps {
  lang: Lang;
  selected: boolean;
  onPress: () => void;
}

/** Large selectable language card: typographic sample tile, native name, direction note and animated radio. */
export const LanguageCard = memo(function LanguageCard({ lang, selected, onPress }: LanguageCardProps) {
  const { t } = useI18n('settings');
  const { colors, isDark } = useTheme();
  const check = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    check.value = selected ? withSpring(1, { damping: 18, stiffness: 220 }) : withTiming(0, { duration: 160 });
  }, [selected, check]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: 0.5 + check.value * 0.5 }],
  }));
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(check.value, [0, 1], [colors.border, colors.accent]),
  }));

  const isArCard = lang === 'ar';
  const name = t(`language.${lang}.name`);
  const note = t(`language.${lang}.note`);
  // Each card is typeset in its own language, whatever the current UI language is.
  const sampleFont = isArCard ? fonts.arHeavy : fonts.displayHeavy;
  const nameFont = isArCard ? fonts.arBold : fonts.display;
  const dir = isArCard ? 'rtl' : 'ltr';

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${name}. ${note}`}
      style={[styles.press, selected ? shadows.gold : isDark ? shadows.none : shadows.sm]}
    >
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth },
          borderStyle,
        ]}
      >
        <View style={styles.sample}>
          {selected ? (
            <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceMuted }]} />
          )}
          <Text
            color={selected ? palette.goldLight : 'ink'}
            align="center"
            allowFontScaling={false}
            style={{ fontFamily: sampleFont, fontSize: 26, lineHeight: isArCard ? 38 : 32, writingDirection: dir }}
          >
            {t(`language.${lang}.sample`)}
          </Text>
        </View>

        <View style={styles.body}>
          <Text variant="h3" numberOfLines={1} style={{ fontFamily: nameFont, writingDirection: dir }}>
            {name}
          </Text>
          <View style={styles.noteRow}>
            {/* Fixed arrows on purpose: they illustrate each language's reading direction. */}
            <Icon name={isArCard ? 'back' : 'arrow'} size={13} color={colors.muted} mirrorInRTL={false} />
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.flex}>
              {note}
            </Text>
          </View>
        </View>

        <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}>
          <Animated.View style={[styles.radioFill, { backgroundColor: colors.accent }, checkStyle]}>
            <Icon name="check" size={13} color={palette.navy} strokeWidth={2.8} />
          </Animated.View>
        </View>
      </Animated.View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  press: { borderRadius: radius.lg, marginBottom: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
  },
  sample: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  body: { flex: 1, gap: space.xs, minWidth: 0 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flexShrink: 1 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioFill: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
