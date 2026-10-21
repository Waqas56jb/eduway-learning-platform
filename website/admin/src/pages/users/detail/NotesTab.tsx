import { useState } from 'react';
import { MessageSquarePlus, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Avatar, Button, Card, CardBody, CardHeader, EmptyState, Textarea } from '@/components/ui';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useStudents } from '@/store/core';
import type { Student } from '@/types';
import { uid } from '@/utils/id';
import { fmtDateTime, fmtRelative } from '@/utils/format';

export function NotesTab({ student }: { student: Student }) {
  const { t } = useTranslation();
  const can = useCan();
  const admin = useCurrentAdmin();
  const update = useStudents((s) => s.update);
  const [body, setBody] = useState('');
  const canEdit = can('users', 'edit');

  const add = () => {
    const text = body.trim();
    if (text.length < 3) return;
    const note = { id: uid('note'), author: admin?.name ?? 'Admin', body: text, createdAt: new Date().toISOString() };
    update(student.id, { notes: [note, ...student.notes] }, { action: 'student.add_note', summary: `Added support note for ${student.name_en}` });
    setBody('');
    toast.success(t('users.notes.added'));
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
              <Button onClick={add} disabled={body.trim().length < 3}>
                {t('users.notes.add')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
      <Card className={canEdit ? 'lg:col-span-3' : 'lg:col-span-5'}>
        <CardHeader title={t('users.tabs.notes')} icon={<NotebookPen className="h-4 w-4" />} />
        {student.notes.length === 0 ? (
          <EmptyState compact title={t('users.notes.empty')} hint={t('users.notes.emptyHint')} />
        ) : (
          <ol className="space-y-4 p-5">
            {student.notes.map((n) => (
              <li key={n.id} className="flex gap-3">
                <Avatar name={n.author} size="sm" />
                <div className="min-w-0 flex-1 rounded-xl rounded-ss-sm border border-line bg-surface-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{n.author}</span>
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
