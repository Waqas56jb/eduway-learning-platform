import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACTIONS, MODULES, type ModuleKey } from '@/types';
import { useLocalize } from '@/hooks/useLocale';
import { usePermissionCatalog, useRolesQuery } from '@/api/security';
import { QueryError } from '@/components/ui/QueryError';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, FilterSelect, Skeleton, Tooltip } from '@/components/ui';

const SHORT: Record<(typeof ACTIONS)[number], string> = { view: 'V', create: 'C', edit: 'E', delete: 'D', approve: 'A', export: 'X' };

export default function Permissions() {
  const { t } = useTranslation();
  const L = useLocalize();
  const q = useRolesQuery();
  const catalog = usePermissionCatalog();
  const loading = q.isLoading;
  const roles = q.data?.items ?? [];
  const [mod, setMod] = useState<ModuleKey | ''>('');
  // Module order/labels from the server catalog (ADM-ROL-07); falls back to the built-in list.
  const modules: ModuleKey[] = catalog.data?.modules?.filter((m) => (MODULES as readonly string[]).includes(m)) ?? [...MODULES];
  const modLabel = (m: ModuleKey) => {
    const l = catalog.data?.labels?.[m];
    return l ? L({ label_en: l.en, label_ar: l.ar }, 'label') : t(`modules.${m}`);
  };

  const head = 'border-b border-line bg-surface-2 px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted';

  return (
    <>
      <PageHeader title={t('security.permissions.title')} subtitle={t('security.permissions.subtitle')} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <FilterSelect
            label={t('security.permissions.filterModule')}
            value={mod}
            onChange={(v) => setMod(v as ModuleKey | '')}
            options={modules.map((m) => ({ value: m, label: modLabel(m) }))}
            className="w-56"
          />
          <div className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-ink/80">{t('security.permissions.legend')}:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded bg-success/15 text-success">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {t('security.permissions.allowed')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded bg-ink/5 text-muted">
                <Minus className="h-3 w-3" />
              </span>
              {t('security.permissions.denied')}
            </span>
            {!mod &&
              ACTIONS.map((a) => (
                <span key={a} className="num">
                  <b className="text-ink">{SHORT[a]}</b> = {t(`perm.${a}`)}
                </span>
              ))}
          </div>
        </div>

        {q.error && !loading ? (
          <QueryError compact error={q.error} onRetry={() => q.refetch()} />
        ) : loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="scrollbar-thin max-h-[72vh] overflow-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th scope="col" className={cn(head, 'text-start')}>
                    {mod ? t('common.actions') : t('security.roleEditor.module')}
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" className={cn(head, 'text-center normal-case tracking-normal')}>
                      <Link to={`/security/roles/${r.id}`} className="group inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-accent" title={t('security.permissions.editRole')}>
                        {L(r, 'name')}
                        <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mod
                  ? ACTIONS.map((a) => (
                      <tr key={a} className="hover:bg-accent/[0.03]">
                        <th scope="row" className="border-b border-line px-4 py-3 text-start font-medium text-ink">
                          {t(`perm.${a}`)}
                        </th>
                        {roles.map((r) => (
                          <td key={r.id} className="border-b border-line px-3 py-3 text-center">
                            <Cell on={!!r.permissions[mod]?.[a]} label={`${L(r, 'name')} — ${t(`perm.${a}`)}`} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : modules.map((m) => (
                      <tr key={m} className="hover:bg-accent/[0.03]">
                        <th scope="row" className="border-b border-line px-4 py-3 text-start">
                          <button type="button" onClick={() => setMod(m)} className="font-medium text-ink hover:text-accent">
                            {modLabel(m)}
                          </button>
                        </th>
                        {roles.map((r) => (
                          <td key={r.id} className="border-b border-line px-3 py-3">
                            <div className="flex justify-center gap-1" dir="ltr">
                              {ACTIONS.map((a) => {
                                const on = !!r.permissions[m]?.[a];
                                return (
                                  <Tooltip key={a} content={`${t(`perm.${a}`)}: ${on ? t('security.permissions.allowed') : t('security.permissions.denied')}`}>
                                    <span
                                      tabIndex={0}
                                      className={cn(
                                        'grid h-5 w-5 place-items-center rounded text-[10px] font-bold num',
                                        on ? 'bg-success/15 text-success' : 'bg-ink/[0.04] text-muted/50',
                                      )}
                                    >
                                      {SHORT[a]}
                                    </span>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Cell({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-grid h-6 w-6 place-items-center rounded-md', on ? 'bg-success/15 text-success' : 'bg-ink/5 text-muted')}
    >
      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Minus className="h-3.5 w-3.5" />}
    </span>
  );
}
