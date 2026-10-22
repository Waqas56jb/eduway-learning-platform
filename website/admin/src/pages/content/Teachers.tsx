import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, GraduationCap, MoreHorizontal, Pencil, Plus, Power, Star, Trash2, UserCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError } from '@/api/client';
import { qk } from '@/api/keys';
import { useApiMutation, useApiQuery } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { useUpload } from '@/api/storage';
import { teachersApi, type AdminTeacherDto, type TeacherWriteDto } from '@/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Drawer,
  Field,
  FileUpload,
  FilterSelect,
  Input,
  MenuDivider,
  MenuItem,
  Popover,
  Select,
  StatCard,
  StatusBadge,
  Switch,
  Textarea,
  useConfirm,
} from '@/components/ui';

/** Flat row for the table (bilingual fields flattened for `useLocalize`). */
type TeacherRow = AdminTeacherDto & { name_en: string; name_ar: string; bio_en: string; bio_ar: string };
const toRow = (x: AdminTeacherDto): TeacherRow => ({ ...x, name_en: x.name.en, name_ar: x.name.ar, bio_en: x.bio?.en ?? '', bio_ar: x.bio?.ar ?? '' });

/** Every place that shows teachers: this page, lesson filters/forms (teachers list) and the lookups cache. */
const teacherKeys = [qk.teachers.all, qk.lookups, qk.lessons.all];

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden />
      <span className="font-semibold text-ink num">{value.toFixed(1)}</span>
      <span className="text-[11px] text-muted num">/ 5</span>
    </span>
  );
}

function TeacherDrawer({ open, teacher, onClose }: { open: boolean; teacher: TeacherRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const { subjects } = useLookups();
  const upload = useUpload('teacher_avatar');
  const [avatarKey, setAvatarKey] = useState<string | null | undefined>(undefined);

  const optionalInt = (max: number) =>
    z.union([z.literal(''), z.coerce.number().int(t('errors.integer')).min(0, t('errors.min', { min: 0 })).max(max, t('errors.max', { max }))]);
  const schema = z.object({
    name_en: z.string().trim().min(2, t('errors.required')).max(120),
    name_ar: z.string().trim().min(2, t('errors.required')).max(120),
    subjectId: z.string().min(1, t('content.teachers.errSubject')),
    bio_en: z.string().trim().max(4000),
    bio_ar: z.string().trim().max(4000),
    yearsExperience: optionalInt(80),
    studentsCount: optionalInt(10_000_000),
    rating: z.union([z.literal(''), z.coerce.number().min(0, t('errors.min', { min: 0 })).max(5, t('errors.max', { max: 5 }))]),
    avatar: z.string(),
    active: z.boolean(),
  });
  type Form = z.infer<typeof schema>;

  const defaults = (): Form =>
    teacher
      ? {
          name_en: teacher.name_en,
          name_ar: teacher.name_ar,
          subjectId: teacher.subjectId,
          bio_en: teacher.bio_en,
          bio_ar: teacher.bio_ar,
          yearsExperience: teacher.yearsExperience ?? '',
          studentsCount: teacher.studentsCount ?? '',
          rating: teacher.rating ?? '',
          avatar: teacher.avatarUrl ?? '',
          active: teacher.active,
        }
      : { name_en: '', name_ar: '', subjectId: '', bio_en: '', bio_ar: '', yearsExperience: '', studentsCount: '', rating: '', avatar: '', active: true };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), values: open ? defaults() : undefined });
  const avatar = watch('avatar');
  const nameEn = watch('name_en') ?? '';

  const close = () => {
    setAvatarKey(undefined);
    upload.reset();
    onClose();
  };

  const num = (v: number | '') => (v === '' ? null : Number(v));
  const save = useApiMutation(
    (v: Form) => {
      const body: TeacherWriteDto = {
        name: { en: v.name_en, ar: v.name_ar },
        bio: { en: v.bio_en, ar: v.bio_ar },
        subjectId: v.subjectId,
        yearsExperience: num(v.yearsExperience),
        studentsCount: num(v.studentsCount),
        rating: num(v.rating),
        active: v.active,
        ...(avatarKey !== undefined ? { avatarFileKey: avatarKey } : {}),
      };
      return teacher ? teachersApi.update(teacher.id, body) : teachersApi.create(body);
    },
    {
      invalidate: teacherKeys,
      silentError: true,
      onSuccess: (_d, v) => {
        toast.success(t(teacher ? 'toast.updated' : 'toast.created', { entity: v.name_en }));
        reset();
        close();
      },
      onError: (e) => {
        if (isApiError(e) && Object.keys(e.fields).length) {
          const map: Record<string, keyof Form> = { 'name.en': 'name_en', 'name.ar': 'name_ar', 'bio.en': 'bio_en', 'bio.ar': 'bio_ar', avatarFileKey: 'avatar' };
          for (const [k, msg] of Object.entries(e.fields)) setError(map[k] ?? (k as keyof Form), { message: msg });
        } else toast.error(errorMessage(e));
      },
    },
  );
  const submit = async (v: Form) => {
    await save.mutateAsync(v).catch(() => undefined);
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={teacher ? t('content.teachers.edit') : t('content.teachers.new')}
      description={t('content.teachers.formHint')}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form="teacher-form" loading={isSubmitting} disabled={upload.uploading}>
            {teacher ? t('actions.saveChanges') : t('content.teachers.create')}
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <Field label={t('content.teachers.photo')} hint={t('content.teachers.photoHint')}>
          <div className="flex items-start gap-4">
            <Avatar name={nameEn || '?'} src={avatar || null} size="xl" />
            <FileUpload
              className="flex-1"
              compact
              accept="image/png,image/jpeg,image/webp"
              maxSizeMb={5}
              preview={null}
              progress={upload.progress}
              disabled={upload.uploading}
              onFile={async (file, url) => {
                if (url) setValue('avatar', url, { shouldDirty: true });
                const r = await upload.start(file);
                if (r) setAvatarKey(r.fileKey);
                else setValue('avatar', teacher?.avatarUrl ?? '', { shouldDirty: true });
              }}
              onClear={
                avatar
                  ? () => {
                      setValue('avatar', '', { shouldDirty: true });
                      setAvatarKey(null);
                    }
                  : undefined
              }
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.nameEn')} error={errors.name_en?.message} required htmlFor="t-en">
            <Input id="t-en" invalid={!!errors.name_en} {...register('name_en')} />
          </Field>
          <Field label={t('common.nameAr')} error={errors.name_ar?.message} required htmlFor="t-ar">
            <Input id="t-ar" dir="rtl" invalid={!!errors.name_ar} {...register('name_ar')} />
          </Field>
        </div>

        <Field label={t('common.subject')} error={errors.subjectId?.message} required htmlFor="t-subject">
          <Select id="t-subject" placeholder="—" invalid={!!errors.subjectId} {...register('subjectId')} options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} />
        </Field>

        <Field label={t('content.teachers.bioEn')} error={errors.bio_en?.message} htmlFor="t-bio-en">
          <Textarea id="t-bio-en" rows={3} {...register('bio_en')} placeholder={t('content.teachers.bioPh')} />
        </Field>
        <Field label={t('content.teachers.bioAr')} error={errors.bio_ar?.message} htmlFor="t-bio-ar">
          <Textarea id="t-bio-ar" rows={3} dir="rtl" {...register('bio_ar')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('content.teachers.years')} error={errors.yearsExperience?.message} htmlFor="t-years">
            <Input id="t-years" type="number" min={0} max={80} invalid={!!errors.yearsExperience} {...register('yearsExperience')} />
          </Field>
          <Field label={t('content.teachers.studentsCount')} error={errors.studentsCount?.message} htmlFor="t-students">
            <Input id="t-students" type="number" min={0} invalid={!!errors.studentsCount} {...register('studentsCount')} />
          </Field>
          <Field label={t('content.teachers.rating')} error={errors.rating?.message} htmlFor="t-rating">
            <Input id="t-rating" type="number" min={0} max={5} step={0.1} invalid={!!errors.rating} {...register('rating')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted">{t('content.teachers.statsHint')}</p>

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <Controller
            control={control}
            name="active"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('content.teachers.activeLabel')} description={t('content.teachers.activeHint')} />}
          />
        </div>
      </form>
    </Drawer>
  );
}

export default function Teachers() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [drawer, setDrawer] = useState<{ open: boolean; teacher: TeacherRow | null }>({ open: false, teacher: null });

  const q = useApiQuery(qk.teachers.list({ view: 'admin' }), () => teachersApi.listFull(), { staleTime: 30_000 });
  const all = useMemo(() => (q.data ?? []).map(toRow), [q.data]);
  const rows = useMemo(
    () => all.filter((x) => (!subject || x.subjectId === subject) && (!status || (status === 'active' ? x.active : !x.active))),
    [all, subject, status],
  );
  const stats = useMemo(
    () => ({
      total: all.length,
      active: all.filter((x) => x.active).length,
      lessons: all.reduce((a, x) => a + x.lessonsCount, 0),
      unassigned: all.filter((x) => x.lessonsCount === 0).length,
    }),
    [all],
  );

  const canEdit = can('content', 'edit');
  const canDelete = can('content', 'delete');

  const toggle = useApiMutation((x: TeacherRow) => teachersApi.update(x.id, { active: !x.active }), {
    invalidate: teacherKeys,
    onSuccess: (_d, x) => toast.success(t(x.active ? 'content.teachers.deactivated' : 'content.teachers.activated', { name: L(x, 'name') })),
  });
  const remove = useApiMutation((x: TeacherRow) => teachersApi.remove(x.id), {
    invalidate: teacherKeys,
    silentError: true,
    onSuccess: (_d, x) => toast.success(t('toast.deleted', { entity: L(x, 'name') })),
    onError: (e) => toast.error(isApiError(e) && e.reason === 'HAS_DEPENDENTS' ? t('content.teachers.deleteBlocked') : errorMessage(e)),
  });

  const onToggle = async (x: TeacherRow) => {
    if (x.active) {
      const ok = await confirm({ title: t('content.teachers.deactivateTitle', { name: L(x, 'name') }), body: t('content.teachers.deactivateBody'), tone: 'warning', confirmText: t('actions.deactivate') });
      if (!ok) return;
    }
    toggle.mutate(x);
  };
  const onDelete = async (x: TeacherRow) => {
    if (x.lessonsCount > 0) {
      toast.error(t('content.teachers.deleteBlockedCount', { count: x.lessonsCount }));
      return;
    }
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(x, 'name') }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (ok) remove.mutate(x);
  };

  const columns = useMemo<ColumnDef<TeacherRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (x) => L(x, 'name'),
        header: t('common.teacher'),
        meta: { label: t('common.teacher'), exportValue: (x) => x.name_en },
        cell: ({ row }) => {
          const x = row.original;
          const bio = L(x, 'bio');
          return (
            <div className="flex min-w-[14rem] max-w-md items-center gap-3">
              <Avatar name={x.name_en} src={x.avatarUrl} size="md" />
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{L(x, 'name')}</div>
                <div className="truncate text-xs text-muted" title={bio !== '—' ? bio : undefined}>
                  {bio !== '—' ? bio : t('content.teachers.noBio')}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'subject',
        accessorFn: (x) => L(lookups.subject(x.subjectId), 'name'),
        header: t('common.subject'),
        meta: { label: t('common.subject') },
        cell: ({ row }) => {
          const s = lookups.subject(row.original.subjectId);
          return (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s?.color ?? '#94A3B8' }} aria-hidden />
              {L(s, 'name')}
            </span>
          );
        },
      },
      {
        id: 'yearsExperience',
        accessorFn: (x) => x.yearsExperience ?? -1,
        header: t('content.teachers.years'),
        meta: { label: t('content.teachers.years'), align: 'end', exportValue: (x) => x.yearsExperience ?? '' },
        cell: ({ row }) => (row.original.yearsExperience === null ? <span className="text-muted">—</span> : <span className="num">{t('content.teachers.yearsValue', { count: row.original.yearsExperience })}</span>),
      },
      {
        id: 'studentsCount',
        accessorFn: (x) => x.studentsCount ?? -1,
        header: t('content.teachers.studentsCount'),
        meta: { label: t('content.teachers.studentsCount'), align: 'end', exportValue: (x) => x.studentsCount ?? '' },
        cell: ({ row }) => (row.original.studentsCount === null ? <span className="text-muted">—</span> : <span className="num">{fmtNumber(row.original.studentsCount)}</span>),
      },
      {
        id: 'rating',
        accessorFn: (x) => x.rating ?? -1,
        header: t('content.teachers.rating'),
        meta: { label: t('content.teachers.rating'), exportValue: (x) => x.rating ?? '' },
        cell: ({ row }) => <Stars value={row.original.rating} />,
      },
      {
        id: 'lessonsCount',
        accessorKey: 'lessonsCount',
        header: t('nav.lessons'),
        meta: { label: t('nav.lessons'), align: 'end' },
        cell: ({ row }) =>
          row.original.lessonsCount ? (
            <Link
              to="/content/lessons"
              state={{ teacherId: row.original.id, subjectId: row.original.subjectId }}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:text-accent hover:underline num"
            >
              <BookOpen className="h-3.5 w-3.5" /> {fmtNumber(row.original.lessonsCount)}
            </Link>
          ) : (
            <span className="text-muted num">0</span>
          ),
      },
      {
        id: 'active',
        accessorFn: (x) => (x.active ? 1 : 0),
        header: t('common.status'),
        meta: { label: t('common.status'), exportValue: (x) => (x.active ? 'active' : 'inactive') },
        cell: ({ row }) => <StatusBadge status={row.original.active ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end', className: 'w-12' },
        cell: ({ row }) =>
          canEdit || canDelete ? (
            <span onClick={(e) => e.stopPropagation()}>
              <Popover
                panelClassName="w-52"
                trigger={({ toggle: open, open: isOpen }) => (
                  <Button variant="ghost" size="icon-sm" onClick={open} aria-expanded={isOpen} aria-label={t('actions.more')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                )}
              >
                {(close) => (
                  <div role="menu">
                    {canEdit && (
                      <MenuItem icon={<Pencil />} onClick={() => { close(); setDrawer({ open: true, teacher: row.original }); }}>
                        {t('actions.edit')}
                      </MenuItem>
                    )}
                    {canEdit && (
                      <MenuItem icon={<Power />} onClick={() => { close(); onToggle(row.original); }}>
                        {row.original.active ? t('actions.deactivate') : t('actions.activate')}
                      </MenuItem>
                    )}
                    {canDelete && (
                      <>
                        <MenuDivider />
                        <MenuItem danger icon={<Trash2 />} disabled={row.original.lessonsCount > 0} hint={row.original.lessonsCount > 0 ? t('content.teachers.hasLessons') : undefined} onClick={() => { close(); onDelete(row.original); }}>
                          {t('actions.delete')}
                        </MenuItem>
                      </>
                    )}
                  </div>
                )}
              </Popover>
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, lookups, canEdit, canDelete],
  );

  return (
    <div>
      <PageHeader
        title={t('content.teachers.title')}
        subtitle={t('content.teachers.subtitle')}
        actions={
          can('content', 'create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDrawer({ open: true, teacher: null })}>
              {t('content.teachers.new')}
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={q.isLoading} label={t('content.teachers.kpiTotal')} value={fmtNumber(stats.total)} icon={<GraduationCap />} color="#0B1F3A" />
        <StatCard loading={q.isLoading} label={t('content.teachers.kpiActive')} value={fmtNumber(stats.active)} icon={<UserCheck />} color="#16A34A" hint={t('content.teachers.kpiInactive', { count: stats.total - stats.active })} />
        <StatCard loading={q.isLoading} label={t('content.teachers.kpiLessons')} value={fmtNumber(stats.lessons)} icon={<BookOpen />} color="#C9A24A" />
        <StatCard loading={q.isLoading} label={t('content.teachers.kpiUnassigned')} value={fmtNumber(stats.unassigned)} icon={<Users />} color="#7C3AED" hint={t('content.teachers.kpiUnassignedHint')} />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        getRowId={(x) => x.id}
        initialSort={[{ id: 'name', desc: false }]}
        searchText={(x) => `${x.name_en} ${x.name_ar} ${x.bio_en} ${x.bio_ar}`}
        searchPlaceholder={t('content.teachers.searchPh')}
        exportName="teachers"
        onRowClick={canEdit ? (x) => setDrawer({ open: true, teacher: x }) : undefined}
        rowClassName={(x) => cn(!x.active && 'opacity-70')}
        toolbar={
          <>
            <FilterSelect label={t('common.subject')} value={subject} onChange={setSubject} options={lookups.subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} />
            <FilterSelect
              label={t('common.status')}
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: t('status.active') },
                { value: 'inactive', label: t('status.inactive') },
              ]}
            />
            {(subject || status) && (
              <Badge tone="accent" className="hidden sm:inline-flex">
                {t('common.results', { count: rows.length })}
              </Badge>
            )}
          </>
        }
        emptyTitle={all.length ? undefined : t('content.teachers.empty')}
        emptyHint={all.length ? undefined : t('content.teachers.emptyHint')}
        emptyAction={
          !all.length && can('content', 'create') ? (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDrawer({ open: true, teacher: null })}>
              {t('content.teachers.new')}
            </Button>
          ) : undefined
        }
      />

      <TeacherDrawer open={drawer.open} teacher={drawer.teacher} onClose={() => setDrawer({ open: false, teacher: null })} />
    </div>
  );
}
