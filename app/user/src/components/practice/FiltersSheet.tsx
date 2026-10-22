import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet, Button, Chip, SegmentedControl, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useBankFacets } from '@/api/bank';
import { space, subjectColors } from '@/theme';
import type { SubjectId } from '@/types';
import {
  DEFAULT_COUNT,
  SESSION_COUNTS,
  toBankQuery,
  type DifficultyFilter,
  type PracticeFilters,
} from '@/utils/practice';
import { haptic } from '@/utils/haptics';

interface Props {
  visible: boolean;
  onClose(): void;
  value: PracticeFilters;
  count: number;
  /** Session sizes from app-config (`learning.practiceSessionSizes`). */
  sizes?: number[];
  onApply(filters: PracticeFilters, count: number): void;
}

const DIFFICULTIES: DifficultyFilter[] = ['all', 'easy', 'medium', 'hard'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Practice filters: subject → unit → topic, difficulty, tags and session size. Edits a draft until Apply. */
export function FiltersSheet({ visible, onClose, value, count, sizes, onApply }: Props) {
  const { t, L } = useI18n('practice');
  const sessionSizes = sizes?.length ? sizes : [...SESSION_COUNTS];
  const [draft, setDraft] = useState<PracticeFilters>(value);
  const [draftCount, setDraftCount] = useState<number>(count);

  // Re-seed the draft each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setDraftCount(count);
    }
  }, [visible, value, count]);

  // BNK-02 for the draft: subject counts, units/topics/tags of the selection and the live match count.
  const query = useMemo(() => toBankQuery(draft), [draft]);
  const { data: facets } = useBankFacets(query, visible);
  const subjects = facets?.subjects ?? [];
  const units = facets?.units ?? [];
  const topics = useMemo(
    () => (facets?.topics ?? []).map((tp) => ({ key: tp.topicId, label: tp.label })),
    [facets?.topics],
  );
  const tags = useMemo(() => (facets?.tags ?? []).map((tg) => tg.slug), [facets?.tags]);
  const tagLabels = useMemo(
    () => new Map((facets?.tags ?? []).map((tg) => [tg.slug, tg.label] as const)),
    [facets?.tags],
  );
  const matches = facets?.matchCount ?? 0;

  const setSubject = (id?: string) => {
    haptic.selection();
    setDraft((d) => ({ ...d, subjectId: d.subjectId === id ? undefined : id, unitId: undefined, topic: undefined, tags: [] }));
  };
  const setUnit = (id?: string) => {
    haptic.selection();
    setDraft((d) => ({ ...d, unitId: d.unitId === id ? undefined : id, topic: undefined }));
  };
  const setTopic = (key?: string) => {
    haptic.selection();
    setDraft((d) => ({ ...d, topic: d.topic === key ? undefined : key }));
  };
  const toggleTag = (tag: string) => {
    haptic.selection();
    setDraft((d) => {
      const cur = d.tags ?? [];
      return { ...d, tags: cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag] };
    });
  };
  const reset = () => {
    haptic.light();
    setDraft({ search: draft.search, difficulty: 'all', tags: [] });
    setDraftCount(sessionSizes[0] ?? DEFAULT_COUNT);
  };

  const footer = (
    <View style={styles.footer}>
      <Text variant="label" color={matches || !facets ? 'muted' : 'danger'} align="center" style={styles.matchText}>
        {matches || !facets
          ? t('matchCount', { questions: t('common:units.questions', { count: matches }) })
          : t('noMatch')}
      </Text>
      <View style={styles.footerRow}>
        <Button title={t('filters.reset')} variant="outline" onPress={reset} style={styles.flex1} icon="refresh" />
        <Button
          title={t('filters.apply')}
          variant="primary"
          onPress={() => {
            haptic.medium();
            onApply(draft, draftCount);
          }}
          style={styles.flex1}
          icon="check"
        />
      </View>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('filters.title')} snap="full" footer={footer}>
      <View style={styles.content}>
        <Section title={t('filters.subject')}>
          <View style={styles.wrap}>
            <Chip label={t('filters.allSubjects')} selected={!draft.subjectId} onPress={() => setSubject(undefined)} />
            {subjects.map((s) => (
              <Chip
                key={s.slug}
                label={t(`common:subjects.${s.slug}`, { defaultValue: L(s.name) })}
                color={subjectColors[s.slug as SubjectId]}
                selected={draft.subjectId === s.slug}
                onPress={() => setSubject(s.slug)}
                count={s.count}
              />
            ))}
          </View>
        </Section>

        {draft.subjectId ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <Section title={t('filters.unit')}>
              <View style={styles.wrap}>
                <Chip label={t('filters.allUnits')} selected={!draft.unitId} onPress={() => setUnit(undefined)} />
                {units.map((u) => (
                  <Chip
                    key={u.unitId}
                    label={L(u.title)}
                    color={subjectColors[draft.subjectId as SubjectId]}
                    selected={draft.unitId === u.unitId}
                    onPress={() => setUnit(u.unitId)}
                  />
                ))}
              </View>
            </Section>
          </Animated.View>
        ) : null}

        <Section title={t('filters.topic')}>
          <View style={styles.wrap}>
            <Chip label={t('filters.allTopics')} selected={!draft.topic} onPress={() => setTopic(undefined)} />
            {topics.map((tp) => (
              <Chip key={tp.key} label={L(tp.label)} selected={draft.topic === tp.key} onPress={() => setTopic(tp.key)} />
            ))}
          </View>
        </Section>

        <Section title={t('filters.difficulty')}>
          <SegmentedControl
            options={DIFFICULTIES.map((d) => ({
              key: d,
              label: d === 'all' ? t('filters.all') : t(`common:difficulty.${d}`),
            }))}
            value={draft.difficulty ?? 'all'}
            onChange={(k) => setDraft((d) => ({ ...d, difficulty: k as DifficultyFilter }))}
          />
        </Section>

        <Section title={t('filters.tags')}>
          <View style={styles.wrap}>
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={t(`tags.${tag}`, { defaultValue: tagLabels.get(tag) ? L(tagLabels.get(tag)!) : tag })}
                icon={draft.tags?.includes(tag) ? 'check' : undefined}
                selected={!!draft.tags?.includes(tag)}
                onPress={() => toggleTag(tag)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('filters.count')}>
          <SegmentedControl
            options={sessionSizes.map((c) => ({ key: String(c), label: t('filters.countOption', { count: c }) }))}
            value={String(draftCount)}
            onChange={(k) => setDraftCount(Number(k))}
          />
        </Section>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.lg },
  section: { marginBottom: space.xl },
  sectionTitle: { marginBottom: space.sm, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { gap: space.sm },
  matchText: { marginBottom: space.xxs },
  footerRow: { flexDirection: 'row', gap: space.md },
  flex1: { flex: 1 },
});
