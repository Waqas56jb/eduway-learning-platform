import { AnimatePresence, motion } from 'framer-motion';
import { Grid2x2, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { BOTTOM_TABS, STUDENT_NAV } from './studentNav';

/** Mobile bottom tab bar with a "More" sheet for the remaining sections. */
export function BottomTabs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const { unreadCount } = useStudent();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const tabs = STUDENT_NAV.filter((n) => BOTTOM_TABS.includes(n.key));
  const rest = STUDENT_NAV.filter((n) => !BOTTOM_TABS.includes(n.key));
  const moreActive = rest.some((n) => pathname.startsWith(n.to));

  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [more]);

  return (
    <>
      <AnimatePresence>
        {more && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-primary/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMore(false)}
              aria-hidden
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white px-4 pb-24 pt-3 shadow-lift lg:hidden"
              role="dialog"
              aria-label={t('student.nav.more')}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-primary/10" aria-hidden />
              <ul className="grid grid-cols-3 gap-2">
                {rest.map((n) => (
                  <li key={n.key}>
                    <NavLink
                      to={n.to}
                      className={({ isActive }) =>
                        cn(
                          'relative flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-xs font-semibold transition',
                          isActive ? 'bg-primary text-white' : 'bg-cream text-primary',
                        )
                      }
                    >
                      <n.icon className="h-5 w-5" aria-hidden />
                      {t(`student.nav.${n.key}`)}
                      {n.key === 'notifications' && unreadCount > 0 && (
                        <span className="absolute end-3 top-3 h-2 w-2 rounded-full bg-danger" aria-hidden />
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-3">
                <LanguageSwitcher />
                <button
                  type="button"
                  onClick={() => {
                    void logout().then(() => navigate('/'));
                  }}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5"
                >
                  <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                  {t('student.nav.logout')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        aria-label={t('nav.mainNav')}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-primary/5 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((n) => (
            <li key={n.key}>
              <NavLink
                to={n.to}
                className={({ isActive }) =>
                  cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', isActive ? 'text-primary' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="tab-indicator" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />}
                    <n.icon className={cn('h-5 w-5', isActive && 'text-accent')} aria-hidden />
                    <span className="max-w-full truncate px-1">{t(`learn.tabs.${n.key}`)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              className={cn('relative flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', moreActive || more ? 'text-primary' : 'text-muted')}
            >
              <Grid2x2 className={cn('h-5 w-5', (moreActive || more) && 'text-accent')} aria-hidden />
              {t('student.nav.more')}
              {unreadCount > 0 && <span className="absolute end-[30%] top-2 h-2 w-2 rounded-full bg-danger" aria-hidden />}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
