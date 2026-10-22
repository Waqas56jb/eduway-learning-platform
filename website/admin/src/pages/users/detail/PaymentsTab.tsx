import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { DataTable, StatusBadge } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { fmtDateTime, fmtMoney } from '@/utils/format';
import { usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { studentsApi, type StudentTransactionRow } from '@/api/students';
import type { Currency } from '@/types';

const GATEWAY: Record<string, string> = { zaincash: 'ZainCash', fastpay: 'FastPay', qicard: 'Qi Card', asiahawala: 'AsiaHawala', visa: 'Visa / Mastercard', mock: 'Mock' };

export function PaymentsTab({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const can = useCan();
  const list = usePagedList<StudentTransactionRow>({
    key: (p) => qk.students.sub('transactions', studentId, p),
    fetcher: (p) => studentsApi.transactions(studentId, p),
    initialSort: '-createdAt',
    pageSize: 10,
  });

  const columns = useMemo<ColumnDef<StudentTransactionRow>[]>(
    () => [
      { accessorKey: 'ref', header: t('users.payments.ref'), enableSorting: false, meta: { label: t('users.payments.ref') }, cell: ({ getValue }) => <span className="font-medium num">{getValue<string>()}</span> },
      {
        id: 'package',
        accessorFn: (x) => x.package?.name[lang] ?? '—',
        header: t('common.package'),
        enableSorting: false,
        meta: { label: t('common.package') },
      },
      { accessorKey: 'amount', header: t('common.amount'), meta: { label: t('common.amount'), align: 'end' }, cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.amount, row.original.currency as Currency)}</span> },
      { id: 'gateway', accessorFn: (x) => GATEWAY[x.gateway] ?? x.gateway, enableSorting: false, header: t('users.payments.gateway'), meta: { label: t('users.payments.gateway') } },
      { accessorKey: 'status', header: t('common.status'), meta: { label: t('common.status') }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'createdAt', header: t('common.date'), meta: { label: t('common.date') }, cell: ({ getValue }) => <span className="whitespace-nowrap">{fmtDateTime(getValue<string>())}</span> },
    ],
    [t, lang],
  );

  return (
    <DataTable
      data={list.items}
      columns={columns}
      loading={list.isLoading}
      error={list.error}
      onRetry={() => list.refetch()}
      server={list.server}
      hideSearch
      pageSize={10}
      onRowClick={can('payments') ? (x) => navigate(`/payments/transactions/${x.id}`) : undefined}
      emptyTitle={t('users.payments.none')}
      emptyHint=" "
    />
  );
}
