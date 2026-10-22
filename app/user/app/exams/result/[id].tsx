import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { asSubjectId } from '@/api/adapters';
import { useExamResult } from '@/api/exams';
import { AnswerReviewList } from '@/components/exams/AnswerReviewList';
import { toReviewAnswers } from '@/components/exams/examUtils';
import { ShareScoreCard } from '@/components/exams/ShareScoreCard';
import { Icon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { QuizResultSummary } from '@/components/student';
import { BarList, Badge, Button, Card, EmptyState, ListRow, SectionHeader, SkeletonCard, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, radius, space, subjectColors, useTheme } from '@/theme';
import { formatDate, formatDuration } from '@/utils/format';

const backToExams = () => router.dismissTo('/exams');

export default function ExamResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('exams');
  const { data: result, isPending } = useExamResult(id);
  const shareRef = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const topics = result?.topicBreakdown ?? [];
  const revision = useMemo(
    () =>
      (result?.recommendations ?? []).map((r) => ({ lessonId: r.lessonId, title: L(r.title), topic: L(r.topic), missed: r.missed })),
    [result, L],
  );
  const reviewAnswers = useMemo(() => (result ? toReviewAnswers(result.answers) : []), [result]);

  if (isPending) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('result.title')} onBack={backToExams} />
        <View style={styles.content}>
          <SkeletonCard lines={4} style={styles.headBlock} />
          <SkeletonCard lines={2} style={styles.verdict} />
          <SkeletonCard lines={3} style={styles.timeRow} />
        </View>
      </Screen>
    );
  }

  if (!result) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('result.title')} onBack={backToExams} />
        <View style={styles.center}>
          <EmptyState
            icon="exam"
            title={t('result.notFoundTitle')}
            message={t('result.notFoundMsg')}
            actionLabel={t('result.backToExams')}
            onAction={backToExams}
          />
        </View>
      </Screen>
    );
  }

  const exam = result.exam;
  const attempt = {
    attemptNo: result.attemptNo,
    score: Math.round(result.score.pct),
    correct: result.score.correct,
    total: result.score.total,
    timeSpentSec: result.timeSpentSec,
    date: result.finishedAt,
  };
  const passMark = exam.passMark;
  const passed = result.passed;
  const unanswered = result.score.unanswered;
  const incorrect = result.score.incorrect;
  const subjectId = asSubjectId(exam.subjectSlug);
  const subjectColor = subjectColors[subjectId] ?? colors.accent;
  const examTitle = L(exam.title) || t(`common:subjects.${subjectId}`);

  const tiles: { key: string; icon: IconName; label: string; value: number; color: string; bg: string }[] = [
    { key: 'c', icon: 'check-circle', label: t('result.correct'), value: attempt.correct, color: colors.success, bg: colors.successSoft },
    { key: 'i', icon: 'x-circle', label: t('result.incorrect'), value: incorrect, color: colors.danger, bg: colors.dangerSoft },
    { key: 'u', icon: 'minus', label: t('result.unanswered'), value: unanswered, color: colors.muted, bg: colors.surfaceMuted },
  ];

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        toast.info(t('result.shareUnavailable'));
        return;
      }
      const uri = await captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('result.shareTitle') });
    } catch {
      toast.error(t('result.shareFailed'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen padded={false} edges={['top']}>
      <Header title={t('result.title')} subtitle={t('result.attemptNo', { no: attempt.attemptNo })} onBack={backToExams} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      <Animated.View entering={FadeInDown.duration(300)} style={styles.headBlock}>
        <View style={styles.examRow}>
          <View style={[styles.dot, { backgroundColor: subjectColor }]} />
          <Text variant="label" color="muted" numberOfLines={1} style={styles.flex}>
            {examTitle}
          </Text>
        </View>
        <QuizResultSummary
          score={attempt.score}
          correct={attempt.correct}
          total={attempt.total}
          timeSpentSec={attempt.timeSpentSec}
          passed={passed}
          title={passed ? t('result.passed') : t('result.failed')}
        />
      </Animated.View>

      {/* Pass / fail verdict */}
      <Animated.View entering={FadeInDown.duration(300).delay(80)}>
        <Card variant={passed ? 'gold' : 'muted'} style={styles.verdict}>
          <Icon name={passed ? 'trophy' : 'target'} size={26} color={passed ? colors.accent : colors.warning} />
          <View style={styles.flex}>
            <View style={styles.verdictHead}>
              <Badge label={passed ? t('result.passed') : t('result.failed')} tone={passed ? 'success' : 'warning'} />
              <Text variant="caption" color="muted">
                {formatDate(attempt.date, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            <Text variant="body" style={styles.verdictMsg}>
              {passed ? t('result.passedMsg', { pass: passMark }) : t('result.failedMsg', { pass: passMark })}
            </Text>
          </View>
        </Card>
      </Animated.View>

      {/* Stat tiles */}
      <Animated.View entering={FadeInDown.duration(300).delay(140)} style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.key} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.tileIcon, { backgroundColor: tile.bg }]}>
              <Icon name={tile.icon} size={16} color={tile.color} />
            </View>
            <Text variant="h2" tabular>
              {tile.value}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {tile.label}
            </Text>
          </View>
        ))}
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(300).delay(180)}>
        <Card style={styles.timeRow}>
          <Icon name="timer" size={18} color={colors.accent} />
          <Text variant="bodyMedium" style={styles.flex}>
            {t('result.timeSpent')}
          </Text>
          <Text variant="bodyBold" tabular style={styles.ltr}>
            {formatDuration(attempt.timeSpentSec)}
          </Text>
          <Text variant="caption" color="muted" tabular style={styles.ltr}>
            {`/ ${formatDuration(exam.durationMin * 60)}`}
          </Text>
        </Card>
      </Animated.View>

      {/* Topic breakdown */}
      <SectionHeader title={t('result.breakdown')} subtitle={t('result.breakdownSub')} style={styles.section} />
      <Card>
        <BarList
          items={topics.map((tp) => ({
            label: L(tp.topic),
            value: tp.accuracy,
            color: tp.accuracy >= 75 ? colors.success : tp.accuracy >= passMark ? colors.accent : colors.danger,
          }))}
        />
      </Card>

      {/* Revision */}
      <SectionHeader title={t('result.revision')} subtitle={revision.length ? t('result.revisionSub') : undefined} style={styles.section} />
      {revision.length ? (
        <Card padded={false} style={styles.revisionCard}>
          {revision.map((r) => (
            <ListRow
              key={r.lessonId}
              icon="lesson"
              iconColor={subjectColor}
              title={r.title}
              subtitle={t('result.revisionMeta', { topic: r.topic, count: r.missed })}
              onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: r.lessonId } })}
            />
          ))}
        </Card>
      ) : (
        <Card variant="muted" style={styles.noGaps}>
          <Icon name="sparkles" size={20} color={colors.accent} />
          <Text variant="body" style={styles.flex}>
            {t('result.noRevision')}
          </Text>
        </Card>
      )}

      {/* Share card */}
      <SectionHeader title={t('result.shareTitle')} style={styles.section} />
      <ShareScoreCard
        ref={shareRef}
        studentName={L(result.student.name)}
        examTitle={examTitle}
        subjectLabel={t(`common:subjects.${subjectId}`)}
        score={attempt.score}
        passed={passed}
        dateLabel={formatDate(attempt.date, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
      />
      <Button title={t('result.share')} icon="share" variant="secondary" loading={sharing} onPress={share} fullWidth style={styles.shareBtn} />

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={showReview ? t('result.hideReview') : t('result.review')}
          icon={showReview ? 'chevron-down' : 'eye'}
          variant="outline"
          onPress={() => setShowReview((v) => !v)}
          fullWidth
        />
        {showReview ? <AnswerReviewList answers={reviewAnswers} /> : null}
        <Button title={t('result.backToExams')} icon="exam" onPress={backToExams} fullWidth />
      </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  content: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.huge },
  ltr: { writingDirection: 'ltr' },
  headBlock: { marginTop: space.sm },
  examRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', marginBottom: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.xl },
  verdictHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  verdictMsg: { marginTop: space.sm },
  tiles: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  section: { marginTop: space.xxl, marginBottom: space.md },
  revisionCard: { overflow: 'hidden' },
  noGaps: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  shareBtn: { marginTop: space.md },
  actions: { gap: space.md, marginTop: space.xxl },
});
