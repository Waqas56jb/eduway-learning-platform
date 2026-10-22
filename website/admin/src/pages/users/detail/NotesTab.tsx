import { useState } from 'react';
import { MessageSquarePlus, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, CardBody, CardHeader, EmptyState, Skeleton, Textarea } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { fmtDateTime, fmtRelative } from '@/utils/format';
import { useApiMutation, useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { studentsApi, type AdminStudentDetail } from '@/api/students';

export function NotesTab({ student }: { student: AdminStudentDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const [body, setBody] = useState('');
  const canEdit = can('users', 'edit');
  const key = qk.students.sub('notes', student.id);
  const q = useApiQuery(key, () => studentsApi.notes(student.id));
  const notes = q.data ?? [];

  const addMut = useApiMutation((text: string) => studentsApi.addNote(student.id, text), {
    invalidate: [key, qk.students.detail(student.id)],
    success: 'users.notes.added',
    onSuccess: () => setBody(''),
  });

  const add = () => {
    const text = body.trim();
    if (text.length < 3 || addMut.isPending) return;
    addMut.mutate(text);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {canEdit && (
        <Card className="h-fit lg:col-span-2">
          <CardHeader title={t('users.notes.add')} icon={<MessageSquarePlus className="h-4 w-4" />} />
          <CardBody>
            <Textarea
              rows={5}
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('users.notes.placeholder')}
              aria-label={t('users.notes.add')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add();
              }}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-muted" dir="ltr">
                Ctrl + Enter
              </span>
              <Button onClick={add} loading={addMut.isPending} disabled={body.trim().length < 3}>
                {t('users.notes.add')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
      <Card className={canEdit ? 'lg:col-span-3' : 'lg:col-span-5'}>
        <CardHeader title={t('users.tabs.notes')} icon={<NotebookPen className="h-4 w-4" />} />
        {q.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : notes.length === 0 ? (
          <EmptyState compact title={t('users.notes.empty')} hint={t('users.notes.emptyHint')} />
        ) : (
          <ol className="space-y-4 p-5">
            {notes.map((n) => (
              <li key={n.id} className="flex gap-3">
                <Avatar name={n.author.name.en} src={n.author.avatarUrl ?? undefined} size="sm" />
                <div className="min-w-0 flex-1 rounded-xl rounded-ss-sm border border-line bg-surface-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{n.author.name[lang]}</span>
                    <time dateTime={n.createdAt} title={fmtDateTime(n.createdAt)} className="text-[11px] text-muted">
                      {fmtRelative(n.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink/85">{n.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
