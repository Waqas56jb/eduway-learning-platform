import { useTranslation } from 'react-i18next';
import { ACTIONS, MODULES, type ModuleKey, type PermAction, type PermissionMatrix } from '@/types';
import { cn } from '@/utils/cn';
import { Checkbox } from '@/components/ui/Switch';

export const TOTAL_PERMISSIONS = MODULES.length * ACTIONS.length;

/** Build a permission matrix from a compact spec: module → allowed actions ('*' = all). */
export function matrix(spec: Partial<Record<ModuleKey, PermAction[] | '*'>>): PermissionMatrix {
  return Object.fromEntries(
    MODULES.map((m) => {
      const allowed = spec[m];
      return [m, Object.fromEntries(ACTIONS.map((a) => [a, allowed === '*' || (allowed?.includes(a) ?? false)]))];
    }),
  ) as PermissionMatrix;
}

export const emptyMatrix = () => matrix({});

/** Fill missing modules/actions (server matrices may omit keys) so the grid never reads undefined. */
export const normalizeMatrix = (m: Partial<PermissionMatrix> | null | undefined): PermissionMatrix =>
  Object.fromEntries(MODULES.map((mod) => [mod, Object.fromEntries(ACTIONS.map((a) => [a, !!m?.[mod]?.[a]]))])) as PermissionMatrix;

export const countGranted = (m: PermissionMatrix) =>
  MODULES.reduce((s, mod) => s + ACTIONS.filter((a) => m[mod]?.[a]).length, 0);

/** "module.action" keys whose value differs between two matrices. */
export function diffPermissions(a: PermissionMatrix, b: PermissionMatrix) {
  const out: string[] = [];
  for (const mod of MODULES) for (const act of ACTIONS) if (!!a[mod]?.[act] !== !!b[mod]?.[act]) out.push(`${mod}.${act}`);
  return out;
}

export const cloneMatrix = (m: PermissionMatrix): PermissionMatrix => normalizeMatrix(m);

/** Apply a cell change while keeping "view" implied by any other granted action. */
export function setPermission(m: PermissionMatrix, mod: ModuleKey, act: PermAction, value: boolean): PermissionMatrix {
  const next = cloneMatrix(m);
  next[mod][act] = value;
  if (value && act !== 'view') next[mod].view = true;
  if (!value && act === 'view') ACTIONS.forEach((a) => (next[mod][a] = false));
  return next;
}

interface RoleMatrixProps {
  value: PermissionMatrix;
  onChange?: (m: PermissionMatrix) => void;
  /** Saved state — changed cells are highlighted against it. */
  baseline?: PermissionMatrix;
  readOnly?: boolean;
}

/** Modules × actions checkbox grid with row/column toggles and a sticky header. */
export function RoleMatrix({ value, onChange, baseline, readOnly }: RoleMatrixProps) {
  const { t } = useTranslation();
  const set = (m: PermissionMatrix) => !readOnly && onChange?.(m);

  const rowState = (mod: ModuleKey) => {
    const n = ACTIONS.filter((a) => value[mod][a]).length;
    return { all: n === ACTIONS.length, some: n > 0 && n < ACTIONS.length };
  };
  const colState = (act: PermAction) => {
    const n = MODULES.filter((m) => value[m][act]).length;
    return { all: n === MODULES.length, some: n > 0 && n < MODULES.length };
  };

  const toggleRow = (mod: ModuleKey) => {
    const on = !rowState(mod).all;
    const next = cloneMatrix(value);
    ACTIONS.forEach((a) => (next[mod][a] = on));
    set(next);
  };
  const toggleCol = (act: PermAction) => {
    const on = !colState(act).all;
    let next = cloneMatrix(value);
    MODULES.forEach((m) => (next = setPermission(next, m, act, on)));
    set(next);
  };

  return (
    <div className="scrollbar-thin max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th scope="col" className="border-b border-line bg-surface-2 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t('security.roleEditor.module')}
            </th>
            {ACTIONS.map((act) => {
              const s = colState(act);
              return (
                <th key={act} scope="col" className="border-b border-line bg-surface-2 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <div className="flex flex-col items-center gap-1.5">
                    <span>{t(`perm.${act}`)}</span>
                    <Checkbox
                      aria-label={t('security.roleEditor.toggleColumn', { action: t(`perm.${act}`) })}
                      checked={s.all}
                      indeterminate={s.some}
                      disabled={readOnly}
                      onChange={() => toggleCol(act)}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((mod) => {
            const r = rowState(mod);
            return (
              <tr key={mod} className="transition-colors hover:bg-accent/[0.03]">
                <th scope="row" className="border-b border-line px-4 py-2.5 text-start font-medium text-ink">
                  <span className="flex items-center gap-3">
                    <Checkbox
                      aria-label={t('security.roleEditor.toggleRow', { module: t(`modules.${mod}`) })}
                      checked={r.all}
                      indeterminate={r.some}
                      disabled={readOnly}
                      onChange={() => toggleRow(mod)}
                    />
                    {t(`modules.${mod}`)}
                  </span>
                </th>
                {ACTIONS.map((act) => {
                  const changed = baseline && !!baseline[mod][act] !== !!value[mod][act];
                  return (
                    <td key={act} className={cn('border-b border-line px-3 py-2.5 text-center', changed && 'bg-accent/10')}>
                      <Checkbox
                        aria-label={`${t(`modules.${mod}`)} — ${t(`perm.${act}`)}`}
                        checked={!!value[mod][act]}
                        disabled={readOnly}
                        onChange={(e) => set(setPermission(value, mod, act, e.target.checked))}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
