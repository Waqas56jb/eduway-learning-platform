import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60vh] place-items-center bg-app px-4">
      <Helmet>
        <title>{t('errors.notFound')}</title>
      </Helmet>
      <div className="max-w-md text-center">
        <div className="kpi-num bg-gold-grad bg-clip-text text-7xl text-transparent">404</div>
        <span className="mx-auto mt-4 grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-primary">{t('errors.notFound')}</h1>
        <p className="mt-2 text-sm text-muted">{t('errors.notFoundSub')}</p>
        <ButtonLink to="/" className="mt-6">
          {t('errors.goHome')}
        </ButtonLink>
      </div>
    </div>
  );
}
