import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { exportCsv } from '@/utils/csv';
import { useDebounce } from '@/hooks/useMisc';
import { Button } from './Button';
import { Checkbox } from './Switch';
import { EmptyState, Skeleton } from './Feedback';
import { Popover } from './Menu';
import { Pagination } from './Pagination';
import type { ServerTableState } from '@/api/hooks';
import { errorMessage } from '@/api/client';

/* Column meta extensions — set on a column via `meta: { ... }`. */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Header text for CSV export and the column toggle menu when `header` is a function. */
    label?: string;
    align?: 'start' | 'end' | 'center';
    /** Extra classes on <td>/<th>. */
    className?: string;
    /** Exclude from CSV export. */
    noExport?: boolean;
    /** Value used for CSV export (defaults to the accessor value). */
    exportValue?: (row: TData) => unknown;
  }
}

export interface DataTableProps<T> {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  loading?: boolean;
  /** Text matched by the search box. Defaults to all string/number fields of the row. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  /** Filter controls rendered next to the search box. */
  toolbar?: ReactNode;
  /** Right-aligned toolbar content (e.g. extra buttons). */
  toolbarEnd?: ReactNode;
  /** Bulk action buttons shown when rows are selected. Enables row selection. */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Enables the Export CSV button; file name prefix. */
  exportName?: string;
  pageSize?: number;
  initialSort?: SortingState;
  initialHidden?: string[];
  getRowId?: (row: T) => string;
  emptyTitle?: ReactNode;
  emptyHint?: ReactNode;
  emptyAction?: ReactNode;
  /** Max body height before scrolling with sticky header. */
  maxHeight?: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Render the table without the card frame (e.g. inside another card). */
  bare?: boolean;
  /** Server-driven paging/sorting/search (from `usePagedList().server`). */
  server?: ServerTableState;
  /** Server export (contract §0.7). Receives selected row ids when called from the bulk bar. Replaces the client CSV export. */
  onExport?: (ids?: string[]) => void;
  exporting?: boolean;
  /** Load error → error state with retry. */
  error?: unknown;
  onRetry?: () => void;
}

function defaultSearchText(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  return Object.values(row as Record<string, unknown>)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');
}

export function DataTable<T>({
  data,
  columns,
  loading,
  searchText,
  searchPlaceholder,
  hideSearch,
  toolbar,
  toolbarEnd,
  bulkActions,
  onRowClick,
  exportName,
  pageSize = 10,
  initialSort = [],
  initialHidden = [],
  getRowId,
  emptyTitle,
  emptyHint,
  emptyAction,
  maxHeight = '68vh',
  className,
  rowClassName,
  bare,
  server,
  onExport,
  exporting,
  error,
  onRetry,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSort);
  const [localQuery, setLocalQuery] = useState('');
  const sorting = server ? server.sorting : localSorting;
  const query = server ? server.search : localQuery;
  const setQuery = server ? server.onSearch : setLocalQuery;
  const q = useDebounce(query, 200);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(initialHidden.map((k) => [k, false])));
  const [localPagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const pagination = server ? { pageIndex: server.page, pageSize: server.pageSize } : localPagination;

  const selectable = !!bulkActions;

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    const select: ColumnDef<T, unknown> = {
      id: '__select',
      enableSorting: false,
      enableHiding: false,
      meta: { noExport: true, className: 'w-10' },
      header: ({ table }) => (
        <Checkbox
          aria-label={t('actions.selectAll')}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox aria-label={t('table.selectRow')} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        </span>
      ),
    };
    return [select, ...columns];
  }, [columns, selectable, t]);

  const searchFn = searchText ?? defaultSearchText;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter: server ? '' : q, rowSelection, columnVisibility: visibility, pagination },
    onSortingChange: (u) => {
      const next = typeof u === 'function' ? u(sorting) : u;
      if (server) server.onSorting(next);
      else setLocalSorting(next);
    },
    manualPagination: !!server,
    manualSorting: !!server,
    manualFiltering: !!server,
    pageCount: server ? Math.max(1, Math.ceil(server.total / server.pageSize)) : undefined,
    enableMultiSort: false,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: (u) => {
      if (server) {
        const next = typeof u === 'function' ? u(pagination) : u;
        if (next.pageSize !== server.pageSize) server.onPageSize(next.pageSize);
        else server.onPage(next.pageIndex);
      } else setPagination(u);
    },
    getRowId: getRowId ?? ((row, i) => ((row as { id?: string }).id ?? String(i))),
    globalFilterFn: (row, _col, value: string) => {
      if (!value) return true;
      const hay = searchFn(row.original).toLowerCase();
      return value
        .toLowerCase()
        .split(/\s+/)
        .every((w) => hay.includes(w));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: selectable,
    autoResetPageIndex: false,
  });

  // Reset to first page when the data set or query changes.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [q, data.length]);

  // Drop selections that no longer exist (e.g. after delete).
  useEffect(() => {
    setRowSelection((sel) => {
      const ids = new Set(table.getCoreRowModel().rows.map((r) => r.id));
      const next = Object.fromEntries(Object.entries(sel).filter(([k]) => ids.has(k)));
      return Object.keys(next).length === Object.keys(sel).length ? sel : next;
    });
  }, [data, table]);

  const filteredRows = table.getFilteredRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const clear = () => setRowSelection({});

  const total = server ? server.total : filteredRows.length;

  const handleExport = () => {
    if (onExport) {
      onExport();
      return;
    }
    const cols = table.getVisibleLeafColumns().filter((c) => !c.columnDef.meta?.noExport && c.id !== '__select');
    const rows = table.getSortedRowModel().rows.filter((r) => filteredRows.includes(r));
    const out = rows.map((r) =>
      Object.fromEntries(
        cols.map((c) => {
          const meta = c.columnDef.meta;
          const v = meta?.exportValue ? meta.exportValue(r.original) : r.getValue(c.id);
          return [c.id, v];
        }),
      ),
    );
    exportCsv(
      exportName ?? 'export',
      out,
      cols.map((c) => ({
        key: c.id,
        header: c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id),
      })),
    );
    toast.success(t('table.exported', { count: out.length }));
  };

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());

  const body = (
    <>
      {/* Toolbar */}
      {(!hideSearch || toolbar || exportName || onExport || toolbarEnd) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {!hideSearch && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder ?? t('table.search')}
                aria-label={t('actions.search')}
                className="field h-9 ps-9 pe-8"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink" aria-label={t('actions.reset')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {toolbar}
          <div className="ms-auto flex items-center gap-2">
            {toolbarEnd}
            {hideable.length > 0 && (
              <Popover
                trigger={({ toggle, open }) => (
                  <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open} icon={<Columns3 className="h-4 w-4" />}>
                    <span className="hidden md:inline">{t('actions.columns')}</span>
                  </Button>
                )}
                panelClassName="w-56"
              >
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{t('table.toggleColumns')}</div>
                {hideable.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-ink/5">
                    <Checkbox checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                    {c.columnDef.meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                  </label>
                ))}
              </Popover>
            )}
            {(exportName || onExport) && (
              <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting} disabled={loading || total === 0} icon={<Download className="h-4 w-4" />}>
                <span className="hidden md:inline">{t('actions.exportCsv')}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {selectable && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-accent/30 bg-accent/[0.07] px-4 py-2 text-sm animate-fade-in">
          <span className="font-semibold text-primary num">{t('table.rowsSelected', { count: selected.length })}</span>
          <button onClick={clear} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
            {t('table.clearSelection')}
          </button>
          <div className="ms-auto flex flex-wrap items-center gap-2">{bulkActions?.(selected, clear)}</div>
        </div>
      )}

      {/* Table */}
      <div className="scrollbar-thin overflow-auto" style={{ maxHeight }}>
        <table className="w-full min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                      className={cn(
                        'whitespace-nowrap border-b border-line bg-surface-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted',
                        meta?.align === 'end' ? 'text-end' : meta?.align === 'center' ? 'text-center' : 'text-start',
                        meta?.className,
                      )}
                    >
                      {h.isPlaceholder ? null : sortable ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn('inline-flex items-center gap-1 uppercase transition-colors hover:text-ink', dir && 'text-primary')}
                          title={dir === 'asc' ? t('table.sortDesc') : t('table.sortAsc')}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                  <tr key={i}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className="border-b border-line px-4 py-3.5">
                        <Skeleton className={cn('h-3.5', c.id === '__select' ? 'w-4' : i % 2 ? 'w-3/4' : 'w-1/2')} />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row.original);
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={cn(
                      'group transition-colors duration-150 hover:bg-accent/[0.04] data-[state=selected]:bg-accent/[0.08]',
                      onRowClick && 'cursor-pointer focus-visible:bg-accent/[0.06] focus-visible:outline-none',
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'border-b border-line px-4 py-3 align-middle text-ink',
                            meta?.align === 'end' ? 'text-end num' : meta?.align === 'center' ? 'text-center' : 'text-start',
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && !!error && (
          <EmptyState
            title={t('api.loadFailed')}
            hint={errorMessage(error)}
            action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t('api.retry')}</Button> : undefined}
          />
        )}
        {!loading && !error && total === 0 && (
          <EmptyState
            title={data.length === 0 && !query ? (emptyTitle ?? t('common.emptyTitle')) : t('common.noResults')}
            hint={data.length === 0 && !query ? (emptyHint ?? t('common.emptyHint')) : t('common.noResultsHint')}
            action={data.length === 0 && !query ? emptyAction : query ? <Button variant="secondary" size="sm" onClick={() => setQuery('')}>{t('actions.clearFilters')}</Button> : undefined}
          />
        )}
      </div>

      {!loading && total > 0 && (
        <Pagination
          page={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={total}
          onPage={(p) => (server ? server.onPage(p) : setPagination((s) => ({ ...s, pageIndex: p })))}
          onPageSize={(s) => (server ? server.onPageSize(s) : setPagination({ pageIndex: 0, pageSize: s }))}
          className="border-t border-line"
        />
      )}
    </>
  );

  if (bare) return <div className={className}>{body}</div>;
  return <div className={cn('card overflow-hidden', className)}>{body}</div>;
}

/** Compact select for table toolbars. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(
          'field h-9 cursor-pointer appearance-none pe-8 text-xs font-medium',
          value ? 'border-accent/60 bg-accent/[0.06] text-primary' : 'text-ink/80',
        )}
      >
        <option value="">
          {label}: {t('common.all')}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}
