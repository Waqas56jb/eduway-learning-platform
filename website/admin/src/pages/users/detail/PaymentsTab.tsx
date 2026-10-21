import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { DataTable, StatusBadge } from '@/components/ui';
import { useLocalize } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { usePackages } from '@/store/core';
import type { Transaction } from '@/types';
import { fmtDateTime, fmtMoney } from '@/utils/format';

const GATEWAY: Record<string, string> = { zaincash: 'ZainCash', fastpay: 'FastPay', qicard: 'Qi Card', asiahawala: 'AsiaHawala', visa: 'Visa / Mastercard' };

export function PaymentsTab({ transactions }: { transactions: Transaction[] }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const packages = usePackages((s) => s.items);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      { accessorKey: 'ref', header: t('users.payments.ref'), meta: { label: t('users.payments.ref') }, cell: ({ getValue }) => <span className="font-medium num">{getValue<string>()}</span> },
      {
        id: 'package',
        accessorFn: (x) => L(packages.find((p) => p.id === x.packageId), 'name'),
        header: t('common.package'),
        meta: { label: t('common.package') },
      },
      { accessorKey: 'amount', header: t('common.amount'), meta: { label: t('common.amount'), align: 'end' }, cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.amount, row.original.currency)}</span> },
      { id: 'gateway', accessorFn: (x) => GATEWAY[x.gateway], header: t('users.payments.gateway'), meta: { label: t('users.payments.gateway') } },
      { accessorKey: 'status', header: t('common.status'), meta: { label: t('common.status') }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'createdAt', header: t('common.date'), meta: { label: t('common.date') }, cell: ({ getValue }) => <span className="whitespace-nowrap">{fmtDateTime(getValue<string>())}</span> },
    ],
    [t, L, packages],
  );

  return (
    <DataTable
      data={transactions}
      columns={columns}
      hideSearch
      pageSize={10}
      initialSort={[{ id: 'createdAt', desc: true }]}
      onRowClick={can('payments') ? (x) => navigate(`/payments/transactions/${x.id}`) : undefined}
      emptyTitle={t('users.payments.none')}
      emptyHint=" "
    />
  );
}
