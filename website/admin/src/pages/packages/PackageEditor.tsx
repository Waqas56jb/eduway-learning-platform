import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Package } from '@/types';
import { uid } from '@/utils/id';
import { usePackages } from '@/store/core';
import { useCan } from '@/store/auth';
import { Drawer } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PackageForm, type PackageFormValues } from '@/components/forms/PackageForm';

const BLANK: PackageFormValues = {
  name_en: '',
  name_ar: '',
  description_en: '',
  description_ar: '',
  subjectIds: [],
  price: 0,
  currency: 'IQD',
  taxBehavior: 'inclusive',
  validityType: 'months',
  validityValue: 10,
  validUntil: null,
  renewal: 'manual',
  accessStart: 'immediate',
  accessStartDate: null,
  status: 'draft',
  featured: false,
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Package to edit; null/undefined creates a new one. */
  pkg?: Package | null;
}

/** Drawer for creating / editing a subscription package. */
export function PackageEditor({ open, onClose, pkg }: Props) {
  const { t } = useTranslation();
  const can = useCan();
  const add = usePackages((s) => s.add);
  const update = usePackages((s) => s.update);
  const editing = !!pkg;
  const allowed = can('packages', editing ? 'edit' : 'create');
  const formId = 'package-form';

  const defaults: PackageFormValues = pkg
    ? (Object.fromEntries(Object.entries(pkg).filter(([k]) => k !== 'id' && k !== 'subscribers')) as PackageFormValues)
    : BLANK;

  const onSubmit = (v: PackageFormValues) => {
    if (pkg) {
      update(pkg.id, v);
      toast.success(t('toast.updated', { entity: t('packages.entity') }));
    } else {
      add({ ...v, id: uid('pkg'), subscribers: 0 });
      toast.success(t('toast.created', { entity: t('packages.entity') }));
    }
    onClose();
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
          <Button type="submit" form={formId} disabled={!allowed}>
            {editing ? t('actions.saveChanges') : t('packages.create')}
          </Button>
        </>
      }
    >
      {open && <PackageForm key={pkg?.id ?? 'new'} formId={formId} defaultValues={defaults} onSubmit={onSubmit} disabled={!allowed} />}
    </Drawer>
  );
}
