/* React-query helpers shared by every admin module. See src/api/README.md. */
import { useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import toast from 'react-hot-toast';
import i18n from '@/i18n';
import { useDebounce } from '@/hooks/useMisc';
import { download, toastError, type ApiError, type Query } from './client';
import type { ExportFormat, ExportRequest, PageMeta, Paged } from './types';

// ─── sort helpers (`sort=field` / `sort=-field`) ─────────────────────────────
export const sortToParam = (s: SortingState): string | undefined =>
  s[0] ? `${s[0].desc ? '-' : ''}${s[0].id}` : undefined;
export const paramToSort = (p?: string): SortingState =>
  p ? [{ id: p.replace(/^-/, ''), desc: p.startsWith('-') }] : [];

/** State that a server-driven `<DataTable server={…}>` needs. */
export interface ServerTableState {
  total: number;
  page: number; // 0-based (UI)
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  sorting: SortingState;
  onSorting: (s: SortingState) => void;
  search: string;
  onSearch: (q: string) => void;
  fetching?: boolean;
}

export interface PagedListOptions<T, F extends Query> {
  /** Query key factory, e.g. `qk.students.list` — receives the full param object. */
  key: (params: Query) => QueryKey;
  fetcher: (params: Query) => Promise<Paged<T>>;
  /** Filter params (anything other than page/pageSize/sort/q). Changing them resets to page 1. */
  filters?: F;
  initialSort?: string;
  pageSize?: number;
  enabled?: boolean;
  /** Poll interval (ms). */
  refetchInterval?: number;
}

/**
 * Paged, filtered, sorted, searchable server list.
 * ```tsx
 * const list = usePagedList({ key: qk.students.list, fetcher: studentsApi.list, filters: { status }, initialSort: '-createdAt' });
 * <DataTable data={list.items} loading={list.isLoading} server={list.server} columns={…} />
 * ```
 */
export function usePagedList<T, F extends Query = Query>(opts: PagedListOptions<T, F>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(opts.pageSize ?? 20);
  const [sort, setSort] = useState<string | undefined>(opts.initialSort);
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const filtersHash = JSON.stringify(opts.filters ?? {});

  useEffect(() => setPage(0), [filtersHash, q, sort, pageSize]);

  const params = useMemo<Query>(
    () => ({ ...(opts.filters ?? {}), q: q || undefined, sort, page: page + 1, pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersHash, q, sort, page, pageSize],
  );

  const query = useQuery<Paged<T>, ApiError>({
    queryKey: opts.key(params),
    queryFn: () => opts.fetcher(params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
  });

  const meta: PageMeta = query.data?.meta ?? { page: page + 1, pageSize, total: 0, nextCursor: null };
  const sorting = useMemo(() => paramToSort(sort), [sort]);

  const server: ServerTableState = {
    total: meta.total,
    page,
    pageSize,
    onPage: setPage,
    onPageSize: setPageSize,
    sorting,
    onSorting: (s) => setSort(sortToParam(s)),
    search,
    onSearch: setSearch,
    fetching: query.isFetching,
  };

  return {
    ...query,
    items: query.data?.items ?? [],
    meta,
    params,
    /** Params without paging — what export endpoints expect in `filters`. */
    exportFilters: { ...(opts.filters ?? {}), q: q || undefined, sort } as Query,
    server,
    isLoading: query.isLoading,
  };
}

/** Plain read with the standard error type. */
export function useApiQuery<T>(key: QueryKey, fn: () => Promise<T>, options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>) {
  return useQuery<T, ApiError>({ queryKey: key, queryFn: fn, ...options });
}

export interface ApiMutationOptions<TData, TVars, TCtx = unknown> extends Omit<UseMutationOptions<TData, ApiError, TVars, TCtx>, 'mutationFn'> {
  /** Query keys (prefixes) to invalidate on success. */
  invalidate?: QueryKey[] | ((data: TData, vars: TVars) => QueryKey[]);
  /** Success toast — a string, an i18n key, or a function. `false` = none. */
  success?: string | ((data: TData, vars: TVars) => string) | false;
  /** Suppress the automatic error toast (handle `error` yourself, e.g. field errors). */
  silentError?: boolean;
}

/**
 * Mutation with invalidation + toasts.
 * ```ts
 * const lock = useApiMutation((v: { id: string; reason: string }) => studentsApi.lock(v.id, v.reason), {
 *   invalidate: [qk.students.all], success: 'users.toast.locked',
 * });
 * ```
 * Optimistic updates: pass `onMutate` / `onError` (rollback) as usual — they're forwarded.
 */
export function useApiMutation<TData, TVars = void, TCtx = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  { invalidate, success, silentError, onSuccess, onError, onSettled, ...rest }: ApiMutationOptions<TData, TVars, TCtx> = {},
) {
  const qc = useQueryClient();
  return useMutation<TData, ApiError, TVars, TCtx>({
    mutationFn: fn,
    meta: { silentError: true }, // errors are toasted here, not by the global handler
    ...rest,
    onSuccess: async (data, vars, ctx, mctx) => {
      if (success) {
        const msg = typeof success === 'function' ? success(data, vars) : success;
        toast.success(i18n.exists(msg) ? i18n.t(msg) : msg);
      }
      await onSuccess?.(data, vars, ctx, mctx);
    },
    onError: (err, vars, ctx, mctx) => {
      if (!silentError) toastError(err);
      onError?.(err, vars, ctx, mctx);
    },
    onSettled: async (data, err, vars, ctx, mctx) => {
      if (!err && invalidate) {
        const keys = typeof invalidate === 'function' ? invalidate(data as TData, vars) : invalidate;
        await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
      } else if (err && invalidate && rest.onMutate) {
        // optimistic update failed → resync
        const keys = typeof invalidate === 'function' ? [] : invalidate;
        await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
      }
      await onSettled?.(data, err, vars, ctx, mctx);
    },
  });
}

/**
 * Server export (contract §0.7): `POST <path>` with `ExportRequest` → file download.
 * ```ts
 * const exp = useExport('/admin/students/export');
 * exp.mutate({ format: 'csv', filters: list.exportFilters, ids: selectedIds });
 * ```
 */
export function useExport(path: string, name = 'export') {
  return useApiMutation(
    (req: ExportRequest) => download(path, { method: 'POST', body: req, fallbackName: `${name}.${req.format}` }),
    { success: (file) => i18n.t('api.exported', { file }) },
  );
}

/** Convenience: run an export with a format (csv default). */
export const exportRequest = (format: ExportFormat, filters?: Query, ids?: string[]): ExportRequest => ({
  format,
  filters: filters ? Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')) : undefined,
  ids: ids?.length ? ids : undefined,
});
