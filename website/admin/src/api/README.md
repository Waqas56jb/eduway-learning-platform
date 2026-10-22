# `src/api` — admin API layer

Binding contract: `docs/API_CONTRACT.md` (all admin endpoints under `/api/v1/admin/*`). Conventions: `docs/ENGINEERING.md §5`.

| File | What |
|---|---|
| `client.ts` | axios instance `http`, typed helpers `api.get/list/post/put/patch/delete` (unwrap the `{ success, data, meta }` envelope), `download()` for file responses, `idempotency()` headers, `ApiError` + `errorMessage()` + `toastError()`, `tokenStore`, single-flight refresh |
| `queryClient.ts` | the `QueryClient` (provided in `main.tsx`). Mutation errors toast globally unless `meta.silentError` |
| `keys.ts` | `qk.<module>.all / .list(params) / .detail(id) / .sub(name, …)` — one root per module |
| `types.ts` | shared DTOs (contract §0–§1, §18): `Localized`, refs, `PageMeta`, `Paged<T>`, `ExportRequest`, `BulkResult`, `NoteDto`, `Kpi`, `SeriesPoint`, `MeAdminDto`, `RoleDto`, uploads… |
| `hooks.ts` | `usePagedList`, `useApiQuery`, `useApiMutation`, `useExport`, `exportRequest`, `sortToParam/paramToSort` |
| `permissions.ts` | `usePermissions()`, `<Can perm="module.action">`, `hasPermission`, `hasPermissionNow` |
| `lookups.ts` | `useLookups()` → `GET /admin/lookups` (subjects, units, topics, packages, schools, marketers, teachers, governorates, admins, roles, gateways, aiModels) with flat `name_en/name_ar` + getters `subject(id)`, `school(id)`… |
| `storage.ts` | `uploadFile(file, purpose, onProgress)` / `useUpload(purpose)` — signed-URL upload (STO-01 → PUT) returning a `fileKey` |
| `auth.ts` | `authApi` (login/MFA/forgot/reset/invite/me/logout), `adminMeApi` (profile, password, preferences, inbox) |
| `<module>.ts` | one file per domain (`students.ts`, `content.ts`, …) exporting typed functions + DTO→UI adapters + hooks |

## Reads

```ts
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import { useApiQuery, usePagedList } from '@/api/hooks';

// one object
const q = useApiQuery(qk.packages.detail(id), () => api.get<AdminPackage>(`/admin/packages/${id}`), { enabled: !!id });

// paged list — server paging/sort/search; filters reset to page 1
const list = usePagedList({
  key: qk.packages.list,
  fetcher: (p) => api.list<AdminPackage>('/admin/packages', p),
  filters: { status },          // '' / 'all' / undefined are dropped automatically
  initialSort: '-createdAt',
});
<DataTable data={list.items.map(toUi)} loading={list.isLoading} error={list.error} onRetry={list.refetch}
           server={list.server} columns={…} />
```

`DataTable` gained server mode: pass `server={list.server}` and it uses the API's `meta.total`, sorting (`sort=field|-field`
from the column id — make column ids match the contract's sortable field names) and the search box (`q`). Without `server`
it stays fully client-side as before (fine for small, unpaged endpoints).

Loading → existing skeletons (`loading`), errors → `error`/`onRetry` (table) or render `t('api.loadFailed')` + retry,
empty → existing `EmptyState`.

## Writes

```ts
const save = useApiMutation((body: PackageInput) => api.patch(`/admin/packages/${id}`, body), {
  invalidate: [qk.packages.all, qk.lookups],   // prefixes
  success: 'toast.saved',                      // i18n key or text; false = none
});
save.mutate(values);                            // errors toast automatically (localized server message)
```

* Field errors: `silentError: true` and read `err.fields` (`{ 'name.en': 'msg' }`) → `setError` in react-hook-form.
* Domain causes: `err.code` (`BUSINESS_RULE`, `CONFLICT` …) + `err.reason` (`HAS_DEPENDENTS`, `INVALID_TRANSITION`,
  `DOUBLE_ATTRIBUTION`, …). i18n fallbacks live in `apiErrors.<CODE>` / `apiErrors.reasons.<REASON>`.
* Optimistic: pass `onMutate` (return rollback ctx) + `onError`; `invalidate` resyncs afterwards.
* `idem` endpoints: `api.post(url, body, idempotency())` — reuse the same key if you retry the same action.

## Exports / downloads

```ts
const exp = useExport('/admin/packages/export', 'packages');
<DataTable onExport={(ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids))} exporting={exp.isPending} … />
// receipts / templates:
download(`/admin/payments/${id}/receipt`, { params: { format: 'pdf' } });
```

## Uploads

```tsx
const up = useUpload('subject_image');
<FileUpload progress={up.progress} onFile={async (f) => { const r = await up.start(f); if (r) setValue('imageFileKey', r.fileKey); }} />
```

## Permissions

`/auth/me` is loaded by `ProtectedRoute` before any page renders; `useAuth().me` holds `MeAdminDto`.

```tsx
const { has, can } = usePermissions();      has('payments.approve')   can('payments', 'export')
<Can perm="payments.approve"><Button …/></Can>
```

Legacy helpers keep working and are backed by the same data: `useCan()(module, action)`, `canNow()`,
`<Can module action>` from `@/routes/guards`, `useCurrentAdmin()` / `useCurrentRole()` (flat UI shapes), `useAuth(s => s.adminId)`.
Super Admin bypasses. The Topbar "preview as role" narrows client gating only.

## Bilingual mapping

API uses `Localized` (`{ en, ar }`); UI types are flat (`name_en/name_ar`). Map in your module's adapter
(`name_en: dto.name.en`) and back (`name: { en: v.name_en, ar: v.name_ar }`), contract §0.7.

## Rules

* No `src/data` imports and no audit writes from the client (the server audits every admin mutation).
* Dates are ISO UTC; date presets resolve to `from`/`to` client-side (`rangeFromPreset` in `store/ui.ts`).
* `__none` filter value = "is null" for nullable FKs.
