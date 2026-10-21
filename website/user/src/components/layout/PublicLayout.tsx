import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import { PageTransition } from './PageTransition';

/** Pages whose first section is a full-bleed dark hero (navbar starts transparent). */
const HERO_ROUTES = ['/', '/about', '/pricing', '/contact'];

export function PublicLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[200] rounded-lg bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        {t('nav.skip')}
      </a>
      <Navbar overHero={HERO_ROUTES.includes(pathname)} />
      <main id="main" className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
