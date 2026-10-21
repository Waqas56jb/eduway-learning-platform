import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettlementsTable } from '@/pages/schools/SettlementsTable';

export default function MarketerSettlements() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('schools.settlements.marketerTitle')} subtitle={t('schools.settlements.marketerSubtitle')} />
      <SettlementsTable partnerType="marketer" />
    </>
  );
}
