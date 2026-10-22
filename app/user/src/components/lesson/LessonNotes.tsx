import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Input, Text } from '@/components/ui';
import { qk } from '@/api/keys';
import { saveLessonNote, useLessonNote } from '@/api/catalog';
import { queryClient } from '@/api/queryClient';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';

const DEBOUNCE_MS = 700;

/** Personal notes for a lesson (GET/PUT /lessons/:id/note), debounced with a "Saved" indicator. */
export const LessonNotes = memo(function LessonNotes({ lessonId, initialText = '' }: { lessonId: string; initialText?: string }) {
  const { t } = useI18n('lesson');
  const { colors } = useTheme();
  const { data } = useLessonNote(lessonId);
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const latest = useRef(text);
  const dirty = useRef(false);
  const mounted = useRef(true);

  // Adopt the server copy until the student starts typing.
  useEffect(() => {
    if (data && !dirty.current) {
      setText(data.text);
      latest.current = data.text;
    }
  }, [data]);

  useEffect(() => {
    latest.current = text;
    if (!dirty.current) return;
    setState('saving');
    const id = setTimeout(() => {
      const value = text;
      saveLessonNote(lessonId, value)
        .then((note) => {
          queryClient.setQueryData(qk.catalog.note(lessonId), note);
          if (latest.current === value) dirty.current = false;
          if (mounted.current) setState('saved');
        })
        .catch(() => {
          if (mounted.current) setState('idle');
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, lessonId]);

  // Flush pending edits on unmount.
  useEffect(
    () => () => {
      mounted.current = false;
      if (dirty.current) {
        const value = latest.current;
        void saveLessonNote(lessonId, value)
          .then((note) => queryClient.setQueryData(qk.catalog.note(lessonId), note))
          .catch(() => undefined);
      }
    },
    [lessonId],
  );

  return (
    <View style={styles.wrap}>
      <Input
        value={text}
        onChangeText={(v) => {
          dirty.current = true;
          setText(v);
        }}
        multiline
        placeholder={t('notes.placeholder')}
        icon="note"
        accessibilityLabel={t('sections.notes')}
        maxLength={2000}
      />
      <View style={styles.footer}>
        <Text variant="caption" color="muted" style={styles.flex}>
          {t('notes.hint')}
        </Text>
        {state === 'saving' ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text variant="caption" color="muted">
              {t('notes.saving')}
            </Text>
          </View>
        ) : state === 'saved' ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.status}>
            <Icon name="check-circle" size={14} color={colors.success} filled />
            <Text variant="caption" color="success">
              {t('notes.saved')}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 20 },
  flex: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
