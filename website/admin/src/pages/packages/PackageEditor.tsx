import { useTranslation } from 'react-i18next';
import { useCan } from '@/store/auth';
import { DEFAULT_COMPARISON, usePackageMutations, type PackageVM } from '@/api/packages';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PackageForm, type PackageFormValues } from '@/components/forms/PackageForm';

const BLANK: PackageFormValues = {
  name_en: '',
  name_ar: '',
  description_en: '',
  description_ar: '',
  tagline_en: '',
  tagline_ar: '',
  subjectIds: [],
  price: 0,
  currency: 'IQD',
  taxBehavior: 'inclusive',
  validityType: 'months',
  validityValue: 10,
  validUntil: null,
  yearlyPrice: null,
  yearlyValidityDays: 365,
  renewal: 'manual',
  accessStart: 'immediate',
  accessStartDate: null,
  status: 'draft',
  featured: false,
  order: 0,
  aiQuota: null,
  features: [],
  comparison: DEFAULT_COMPARISON,
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Package to edit; null/undefined creates a new one. */
  pkg?: PackageVM | null;
}

/** Drawer for creating / editing a subscription package. */
export function PackageEditor({ open, onClose, pkg }: Props) {
  const { t } = useTranslation();
  const can = useCan();
  const m = usePackageMutations();
  const editing = !!pkg;
  const allowed = can('packages', editing ? 'edit' : 'create');
  const formId = 'package-form';
  const saving = m.create.isPending || m.update.isPending;

  const defaults: PackageFormValues = pkg
    ? (Object.fromEntries(Object.entries(pkg).filter(([k]) => !['id', 'subscribers', 'createdAt', 'updatedAt'].includes(k))) as PackageFormValues)
    : BLANK;

  const onSubmit = (v: PackageFormValues) => {
    if (pkg) m.update.mutate({ id: pkg.id, values: v }, { onSuccess: onClose });
    else m.create.mutate(v, { onSuccess: onClose });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? t('packages.edit') : t('packages.new')}
      description={pkg?.name_en}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={!allowed} loading={saving}>
            {editing ? t('actions.saveChanges') : t('packages.create')}
          </Button>
        </>
      }
    >
      {open && <PackageForm key={pkg?.id ?? 'new'} formId={formId} defaultValues={defaults} onSubmit={onSubmit} disabled={!allowed} />}
    </Drawer>
  );
}
