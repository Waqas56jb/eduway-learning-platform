import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import type { ContentStatus, Lesson } from '@/types';
import { useCan } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Input';
import { qk } from '@/api/keys';
import { lessonsApi, type LessonVM, type LessonWriteDto } from '@/api/content';

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

/** Status transitions for lessons (ADM-LSN-06). The server writes the version entry and the audit log. */
export function useLessonStatus() {
  const { t } = useTranslation();
  const can = useCan();
  const qc = useQueryClient();

  const allowed = useCallback(
    (to: ContentStatus) => (APPROVAL_STATUSES.has(to) ? can('content', 'approve') : can('content', 'edit') || can('content', 'create')),
    [can],
  );

  const move = useCallback(
    async (lesson: Pick<Lesson, 'id'>, to: ContentStatus, publishAt?: string | null, patch?: Partial<LessonWriteDto>): Promise<LessonVM> => {
      const res = await lessonsApi.transition(lesson.id, {
        to,
        publishAt: to === 'scheduled' ? (publishAt ?? undefined) : undefined,
        note: t(`content.editor.versionNote.${to}`, { lng: 'en' }),
        patch,
      });
      qc.setQueryData(qk.lessons.detail(lesson.id), res);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.lessons.all }), qc.invalidateQueries({ queryKey: qk.dashboard.all })]);
      return res;
    },
    [t, qc],
  );

  return { allowed, move };
}

/** Default schedule time: tomorrow 18:00 local. */
const defaultSchedule = () => {
  const d = new Date();
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
