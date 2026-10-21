import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import type { ContentStatus, Lesson, LessonVersion } from '@/types';
import { uid } from '@/utils/id';
import { useLessons } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { MOCK_NOW } from '@/utils/random';

export const CONTENT_STATUSES: ContentStatus[] = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'];

/** Statuses only supervisors (content.approve) may move a lesson into. */
export const APPROVAL_STATUSES = new Set<ContentStatus>(['approved', 'scheduled', 'published', 'archived']);

export const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: '#9CA3AF',
  in_review: '#F59E0B',
  approved: '#2563EB',
  scheduled: '#7C3AED',
  published: '#16A34A',
  archived: '#64748B',
};

const STATUS_ACTION: Record<ContentStatus, string> = {
  draft: 'revert_draft',
  in_review: 'submit',
  approved: 'approve',
  scheduled: 'schedule',
  published: 'publish',
  archived: 'archive',
};

export function nextVersion(lesson: Pick<Lesson, 'versions'>, status: ContentStatus, note: string, author: string): LessonVersion[] {
  const top = lesson.versions.reduce((m, v) => Math.max(m, v.version), 0);
  return [{ id: uid('ver'), version: top + 1, author, note, status, createdAt: new Date().toISOString() }, ...lesson.versions];
}

/** Status transitions for lessons with permission checks, version entries and audit summaries. */
export function useLessonStatus() {
  const { t } = useTranslation();
  const can = useCan();
  const admin = useCurrentAdmin();
  const update = useLessons((s) => s.update);

  const allowed = useCallback(
    (to: ContentStatus) => (APPROVAL_STATUSES.has(to) ? can('content', 'approve') : can('content', 'edit') || can('content', 'create')),
    [can],
  );

  const move = useCallback(
    (lesson: Lesson, to: ContentStatus, publishAt?: string | null) => {
      const author = admin?.name ?? 'System';
      const patch: Partial<Lesson> = {
        status: to,
        updatedAt: new Date().toISOString(),
        versions: nextVersion(lesson, to, t(`content.editor.versionNote.${to}`, { lng: 'en' }), author),
      };
      if (to === 'scheduled') patch.publishAt = publishAt ?? null;
      if (to === 'published') patch.publishAt = new Date().toISOString();
      if (to === 'draft' || to === 'in_review' || to === 'approved') patch.publishAt = null;
      update(lesson.id, patch, {
        action: `lesson.${STATUS_ACTION[to]}`,
        summary: `Moved lesson “${lesson.title_en}” from ${lesson.status.replace('_', ' ')} to ${to.replace('_', ' ')}`,
      });
    },
    [admin, t, update],
  );

  return { allowed, move };
}

/** Default schedule time: tomorrow 18:00 local. */
const defaultSchedule = () => {
  const d = new Date(MOCK_NOW > new Date() ? MOCK_NOW : new Date());
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

interface ScheduleModalProps {
  open: boolean;
  title: string;
  initial?: string | null;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}

export function ScheduleModal({ open, title, initial, onClose, onConfirm }: ScheduleModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultSchedule);
  useEffect(() => {
    if (open) setValue(initial ? format(new Date(initial), "yyyy-MM-dd'T'HH:mm") : defaultSchedule());
  }, [open, initial]);
  const valid = !!value && new Date(value).getTime() > Date.now() - 60_000;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={t('content.editor.scheduleBody')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={!valid} icon={<CalendarClock className="h-4 w-4" />} onClick={() => onConfirm(new Date(value).toISOString())}>
            {t('actions.schedule')}
          </Button>
        </>
      }
    >
      <Field label={t('content.editor.scheduleFor')} htmlFor="schedule-at">
        <Input id="schedule-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
}
