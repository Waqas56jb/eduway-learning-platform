import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { Chip, PressableScale, Text } from '@/components/ui';
import type { LegalDocumentDto } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export type LegalDocKey = 'terms' | 'privacy';

export interface LegalDocumentProps {
  doc: LegalDocKey;
  /** Section ids, in reading order (keys under `legal:<doc>.sections`). */
  sections: readonly string[];
  /** ISO date of the last revision. */
  updatedAt: string;
  icon: IconName;
  contactEmail: string;
  /** Published document from GET /legal/:doc — overrides the bundled copy (used while loading / offline). */
  remote?: LegalDocumentDto | null;
}

/** Comfortable measure for long-form reading (≈ 65–75 characters). */
const MAX_MEASURE = 620;
/** Section titles carry their own "1. " / "١. " prefix in the copy — split it off for the editorial numeral. */
const NUMBER_PREFIX = /^\s*([0-9٠-٩]+)[.٫۔]?\s*/;

function splitTitle(raw: string): { num: string | null; title: string } {
  const m = raw.match(NUMBER_PREFIX);
  if (!m) return { num: null, title: raw };
  return { num: m[1] ?? null, title: raw.slice(m[0].length) };
}

/** One paragraph block; lines starting with "• " become bullet rows. */
const Paragraph = memo(function Paragraph({
  text,
  bulletColor,
  bodyStyle,
}: {
  text: string;
  bulletColor: string;
  bodyStyle: { fontSize: number; lineHeight: number };
}) {
  const dotTop = (bodyStyle.lineHeight - 6) / 2;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  return (
    <View style={styles.paragraph}>
      {lines.map((line, i) =>
        line.startsWith('• ') ? (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: bulletColor, marginTop: dotTop }]} />
            <Text variant="body" style={[styles.flex, bodyStyle]}>
              {line.slice(2)}
            </Text>
          </View>
        ) : (
          <Text key={i} variant="body" style={bodyStyle}>
            {line}
          </Text>
        ),
      )}
    </View>
  );
});

/** Shared editorial layout for Terms / Privacy: hero, sticky table-of-contents chips, numbered Playfair sections. */
export const LegalDocument = memo(function LegalDocument({
  doc,
  sections: localSections,
  updatedAt: localUpdatedAt,
  icon,
  contactEmail: localEmail,
  remote,
}: LegalDocumentProps) {
  const { t, lang, isAr, L } = useI18n('legal');
  const remoteSections = remote?.sections.length ? remote.sections : null;
  const sections = useMemo(
    () => (remoteSections ? remoteSections.map((s) => s.id) : localSections),
    [remoteSections, localSections],
  );
  const updatedAt = remote?.updatedAt ?? localUpdatedAt;
  const contactEmail = remote?.contactEmail || localEmail;
  const docTitle = remote ? L(remote.title) : t(`${doc}.title`);
  const docSubtitle = remote ? L(remote.subtitle) : t(`${doc}.subtitle`);
  const docIntro = remote ? L(remote.intro) : t(`${doc}.intro`);
  const sectionBody = useCallback(
    (id: string) => {
      const r = remoteSections?.find((s) => s.id === id);
      return r ? L(r.body) : t(`${doc}.sections.${id}.body`);
    },
    [remoteSections, L, t, doc],
  );
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const tocHeight = useRef(0);
  const [active, setActive] = useState<string>(sections[0] ?? '');

  const bodyStyle = useMemo(() => ({ fontSize: 16, lineHeight: isAr ? 29 : 26 }), [isAr]);
  const titles = useMemo(
    () =>
      Object.fromEntries(
        sections.map((id) => {
          const r = remoteSections?.find((s) => s.id === id);
          return [id, splitTitle(r ? L(r.title) : t(`${doc}.sections.${id}.title`))];
        }),
      ),
    [sections, remoteSections, doc, t, L],
  );

  const onSectionLayout = useCallback(
    (id: string) => (e: LayoutChangeEvent) => {
      offsets.current[id] = e.nativeEvent.layout.y;
    },
    [],
  );

  const jumpTo = useCallback((id: string) => {
    const y = offsets.current[id];
    haptic.selection();
    setActive(id);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - tocHeight.current - space.sm), animated: true });
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y + tocHeight.current + space.xxxl;
      let current = sections[0] ?? '';
      for (const id of sections) {
        const top = offsets.current[id];
        if (top !== undefined && top <= y) current = id;
      }
      setActive((prev) => (prev === current ? prev : current));
    },
    [sections],
  );

  const date = formatDate(updatedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Screen padded={false}>
      <Header title={docTitle} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={64}
      >
        {/* 0 — hero */}
        <Animated.View entering={FadeInDown.duration(320)} style={[styles.measure, styles.hero]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name={icon} size={24} color={colors.accent} strokeWidth={2} />
          </View>
          <Text variant="display" display accessibilityRole="header">
            {docTitle}
          </Text>
          <Text variant="bodyMedium" color="muted">
            {docSubtitle}
          </Text>
          <View style={[styles.updated, { backgroundColor: colors.accentSoft }]}>
            <Icon name="calendar" size={13} color={isDark ? colors.accentLight : colors.accent} />
            <Text variant="caption" color={isDark ? colors.accentLight : colors.accent}>
              {t('lastUpdated', { date })}
            </Text>
          </View>
          <View style={[styles.intro, { borderStartColor: colors.accent }]}>
            <Text variant="body" color="muted" style={bodyStyle}>
              {docIntro}
            </Text>
          </View>
        </Animated.View>

        {/* 1 — sticky table of contents */}
        <View
          onLayout={(e) => {
            tocHeight.current = e.nativeEvent.layout.height;
          }}
          style={[styles.toc, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('contents')}
          >
            {sections.map((id) => (
              <Chip
                key={id}
                label={titles[id]?.title ?? id}
                selected={active === id}
                onPress={() => jumpTo(id)}
              />
            ))}
          </ScrollView>
        </View>

        {/* 2… — sections */}
        {sections.map((id, i) => {
          const { num, title } = titles[id] ?? { num: null, title: id };
          return (
            <View key={id} onLayout={onSectionLayout(id)} style={[styles.measure, styles.section]}>
              <View style={styles.sectionHead}>
                {num ? (
                  <Text variant="h1" display color={isDark ? colors.accentLight : colors.accent} style={styles.num}>
                    {num.padStart(2, isAr ? '٠' : '0')}
                  </Text>
                ) : null}
                <View style={[styles.rule, { backgroundColor: colors.border }]} />
              </View>
              <Text variant="h2" display accessibilityRole="header" style={styles.sectionTitle}>
                {title}
              </Text>
              {sectionBody(id)
                .split('\n\n')
                .map((p, pi) => (
                  <Paragraph key={pi} text={p} bulletColor={colors.accent} bodyStyle={bodyStyle} />
                ))}
              {i === sections.length - 1 ? null : <View style={styles.sectionGap} />}
            </View>
          );
        })}

        <View style={styles.measure}>
          <View style={[styles.contact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: colors.accentSoft }]}>
              <Icon name="mail" size={18} color={colors.accent} strokeWidth={2} />
            </View>
            <Text variant="bodyBold" style={styles.flex}>
              {t('questionsTitle')}
            </Text>
          </View>
          <Text variant="body" color="muted">
            {t('questionsBody', { email: contactEmail })}
          </Text>
          </View>
        </View>

        <PressableScale
          onPress={() => {
            setActive(sections[0] ?? '');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          accessibilityRole="button"
          style={[styles.top, { borderColor: colors.border }]}
        >
          <Icon name="chevron-down" size={16} color={colors.ink} style={styles.up} />
          <Text variant="label">{t('backToTop')}</Text>
        </PressableScale>
      </ScrollView>
    </Screen>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: space.huge },
  measure: { width: '100%', maxWidth: MAX_MEASURE, alignSelf: 'center', paddingHorizontal: SCREEN_PADDING },
  hero: { gap: space.sm, paddingTop: space.sm, paddingBottom: space.xl },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  updated: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 28,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    marginTop: space.xs,
  },
  intro: { borderStartWidth: 3, paddingStart: space.lg, marginTop: space.lg },
  toc: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  chips: { gap: space.sm, paddingHorizontal: SCREEN_PADDING },
  section: { paddingTop: space.xxl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  num: { fontSize: 30, lineHeight: 38 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionTitle: { marginBottom: space.md },
  sectionGap: { height: space.xs },
  paragraph: { gap: space.sm, marginBottom: space.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  bulletDot: { width: 6, height: 6, borderRadius: 3 },
  flex: { flex: 1 },
  contact: {
    marginTop: space.xl,
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  contactIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space.xl,
  },
  up: { transform: [{ rotate: '180deg' }] },
});
