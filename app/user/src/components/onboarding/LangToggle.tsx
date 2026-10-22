import { BlurView } from 'expo-blur';
import { isRTL } from '@/utils/rtl';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useLangStore } from '@/store/langStore';
import { palette, radius } from '@/theme';
import type { Lang } from '@/types';
import { haptic } from '@/utils/haptics';
import { ink } from './tokens';

const SEG_W = 46;
const H = 36;
const PAD = 4;
const OPTIONS: Lang[] = ['en', 'ar'];
const SPRING = { damping: 18, stiffness: 220 } as const;

/** Frosted "EN | ع" language switch with a sliding gold thumb, for the dark photo screens. */
export const LangToggle = memo(function LangToggle() {
  const { t, lang } = useI18n('onboarding');
  const pos = useSharedValue(lang === 'en' ? 0 : 1);

  useEffect(() => {
    pos.value = withSpring(lang === 'en' ? 0 : 1, SPRING);
  }, [lang, pos]);

  // Thumb is anchored at the start edge; translateX is not mirrored natively, so flip it in RTL.
  const dir = isRTL() ? -1 : 1;
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * SEG_W * dir }] }));

  const select = (next: Lang) => {
    if (next === lang) return;
    haptic.selection();
    pos.value = withSpring(next === 'en' ? 0 : 1, SPRING);
    void useLangStore.getState().setLanguage(next);
  };

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={t('a11y.language')}>
      <View style={styles.glass} pointerEvents="none">
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.wash} />
      </View>
      <Animated.View style={[styles.indicator, indicator]} pointerEvents="none" />
      {OPTIONS.map((opt) => {
        const selected = opt === lang;
        return (
          <PressableScale
            key={opt}
            onPress={() => select(opt)}
            haptics={false}
            scaleTo={0.92}
            style={styles.seg}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt === 'en' ? t('a11y.english') : t('a11y.arabic')}
          >
            <Text variant="label" color={selected ? palette.navy : ink.white} align="center">
              {opt === 'en' ? t('welcome.langEn') : t('welcome.langAr')}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    height: H + PAD * 2,
    padding: PAD,
    borderRadius: radius.pill,
  },
  glass: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
  },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: ink.glass },
  indicator: {
    position: 'absolute',
    top: PAD,
    start: PAD,
    width: SEG_W,
    height: H,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
  },
  seg: { width: SEG_W, height: H, alignItems: 'center', justifyContent: 'center' },
});
