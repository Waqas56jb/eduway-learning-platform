import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { Button, Logo } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

const LINKS = [
  { to: '/', key: 'home', end: true },
  { to: '/#subjects', key: 'subjects' },
  { to: '/pricing', key: 'pricing' },
  { to: '/about', key: 'about' },
  { to: '/contact', key: 'contact' },
] as const;

/**
 * Sticky public navbar. When `overHero` is true it starts transparent (white text)
 * and turns into cream glass after scrolling.
 */
export function Navbar({ overHero = false }: { overHero?: boolean }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { isRtl } = useLang();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const transparent = overHero && !scrolled && !open;

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          transparent
            ? 'bg-transparent py-5'
            : 'border-b border-primary/5 bg-cream/90 py-3 shadow-[0_8px_30px_-20px_rgba(11,31,58,0.35)] backdrop-blur-xl backdrop-saturate-150',
        )}
      >
        <nav
          aria-label={t('nav.mainNav')}
          className="container flex items-center justify-between gap-6"
        >
          <Logo light={transparent} />

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.key}>
                <NavLink
                  to={l.to}
                  end={'end' in l ? l.end : undefined}
                  className={({ isActive }) =>
                    cn(
                      'relative rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                      transparent
                        ? 'text-white/85 hover:text-white'
                        : 'text-primary/75 hover:text-primary',
                      isActive &&
                        !l.to.includes('#') &&
                        (transparent ? 'text-white' : 'text-primary'),
                      isActive &&
                        !l.to.includes('#') &&
                        'after:absolute after:inset-x-4 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent',
                    )
                  }
                >
                  {t(`nav.${l.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 lg:flex">
            <LanguageSwitcher tone={transparent ? 'light' : 'dark'} />
            {isAuthenticated ? (
              <Button
                to="/student/dashboard"
                variant="gold"
                leftIcon={<LayoutDashboard className="h-4 w-4" />}
              >
                {t('nav.dashboard')}
              </Button>
            ) : (
              <>
                <Button to="/login" variant={transparent ? 'glass' : 'ghost'}>
                  {t('nav.login')}
                </Button>
                <Button to="/register" variant="gold">
                  {t('nav.startLearning')}
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className={cn('rounded-xl p-2 lg:hidden', transparent ? 'text-white' : 'text-primary')}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </nav>
      </header>

      {/* Rendered outside <header>: its backdrop-filter would otherwise become the containing block of this fixed panel. */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 bottom-0 top-[64px] z-40 flex flex-col overflow-y-auto bg-primary px-6 pb-10 pt-8 lg:hidden"
          >
            <div
              className="pointer-events-none absolute -top-20 end-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
              aria-hidden
            />
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
              }}
              className="relative space-y-1"
            >
              {LINKS.map((l) => (
                <motion.li
                  key={l.key}
                  variants={{ hidden: { opacity: 0, x: isRtl ? 20 : -20 }, show: { opacity: 1, x: 0 } }}
                >
                  <NavLink
                    to={l.to}
                    end={'end' in l ? l.end : undefined}
                    className="block rounded-2xl px-4 py-4 font-display text-3xl font-bold text-white transition hover:bg-white/5 hover:text-accent-light"
                  >
                    {t(`nav.${l.key}`)}
                  </NavLink>
                </motion.li>
              ))}
            </motion.ul>
            <div className="relative mt-auto space-y-4 pt-10">
              <LanguageSwitcher tone="light" />
              {isAuthenticated ? (
                <Button to="/student/dashboard" variant="gold" size="lg" fullWidth>
                  {t('nav.dashboard')}
                </Button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button to="/login" variant="glass" size="lg" fullWidth>
                    {t('nav.login')}
                  </Button>
                  <Button to="/register" variant="gold" size="lg" fullWidth>
                    {t('nav.startLearning')}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
