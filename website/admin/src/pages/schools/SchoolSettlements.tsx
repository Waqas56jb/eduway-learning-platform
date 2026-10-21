import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettlementsTable } from './SettlementsTable';

export default function SchoolSettlements() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('schools.settlements.title')} subtitle={t('schools.settlements.subtitle')} />
      <SettlementsTable partnerType="school" />
    </>
  );
}
