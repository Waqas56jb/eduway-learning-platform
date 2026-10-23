import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, Crown, LogOut, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Logo, LogoMark, ProgressBar } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { STUDENT_NAV } from './studentNav';

/** Desktop sidebar (lg+). On smaller screens the same content opens as a drawer (`SidebarDrawer`). */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 88 : 280 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-e border-white/5 bg-primary text-white lg:flex"
    >
      <SidebarBody collapsed={collapsed} onToggle={onToggle} />
    </motion.aside>
  );
}

/** Off-canvas navigation drawer for phones/tablets, opened from the top bar's menu button. */
export function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { dir } = useLang();
  const { pathname } = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const off = dir === 'rtl' ? '100%' : '-100%';

  // Close on navigation.
  useEffect(() => onClose(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => closeRef.current?.focus(), 50);
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => mq.matches && onClose();
    mq.addEventListener('change', onMq);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
      window.clearTimeout(id);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <motion.div
            className="absolute inset-0 bg-primary/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mainNav')}
            initial={{ x: off }}
            animate={{ x: 0 }}
            exit={{ x: off }}
            transition={{ type: 'spring', stiffness: 340, damping: 36 }}
            className="absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col bg-primary text-white shadow-lift"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="absolute end-3 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody collapsed={false} drawer />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function SidebarBody({ collapsed, onToggle, drawer }: { collapsed: boolean; onToggle?: () => void; drawer?: boolean }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const { user, me, logout } = useAuth();
  const { unreadCount } = useStudent();
  const navigate = useNavigate();
  const sub = me?.subscription;
  const pkg = sub && (sub.status === 'active' || sub.status === 'trial') ? sub.package : null;
  const totalDays = Math.max(1, sub?.totalDays ?? 30);
  const groups = ['learn', 'practice', 'account'] as const;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/10 to-transparent" aria-hidden />
      <div className={cn('relative flex h-20 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between px-6')}>
        {collapsed ? <LogoMark /> : <Logo light to="/student/dashboard" />}
      </div>

      <nav className="scrollbar-none relative flex-1 overflow-y-auto px-4 pb-4" aria-label={t('nav.mainNav')}>
        {groups.map((g) => (
          <div key={g} className="mt-5 first:mt-2">
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 rtl:tracking-normal">
                {t(`student.nav.${g}`)}
              </p>
            )}
            <ul className="space-y-1">
              {STUDENT_NAV.filter((n) => n.group === g).map((n) => (
                <li key={n.key}>
                  <NavLink
                    to={n.to}
                    title={collapsed ? t(`student.nav.${n.key}`) : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        collapsed && 'justify-center',
                        isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId={drawer ? 'drawer-active' : 'sidebar-active'}
                            className="absolute inset-y-2 start-0 w-1 rounded-full bg-accent shadow-[0_0_12px_rgba(201,162,74,0.8)]"
                          />
                        )}
                        <n.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-accent')} aria-hidden />
                        {!collapsed && <span className="truncate">{t(`student.nav.${n.key}`)}</span>}
                        {n.key === 'notifications' && unreadCount > 0 && (
                          <span
                            className={cn(
                              'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-primary',
                              collapsed ? 'absolute end-1.5 top-1' : 'ms-auto',
                            )}
                          >
                            {unreadCount}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative space-y-3 border-t border-white/10 p-4">
        {!collapsed && user && pkg && (
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/15 to-transparent p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-light">
              <Crown className="h-4 w-4" aria-hidden />
              {l(pkg.name)}
            </div>
            <p className="mt-1 text-xs text-white/60">{t('student.plan.daysLeft', { count: user.daysRemaining })}</p>
            <ProgressBar value={((totalDays - user.daysRemaining) / totalDays) * 100} gold size="xs" className="mt-3 bg-white/10" />
          </div>
        )}
        <div className={cn('flex gap-2', collapsed ? 'flex-col items-center' : 'items-center')}>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => navigate('/'));
            }}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white',
              !collapsed && 'flex-1',
            )}
            title={t('student.nav.logout')}
          >
            <LogOut className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
            {!collapsed && t('student.nav.logout')}
          </button>
          {drawer && <LanguageSwitcher tone="light" />}
          {!drawer && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? t('student.topbar.expand') : t('student.topbar.collapse')}
            className="rounded-xl p-2.5 text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <ChevronsLeft className={cn('h-5 w-5 transition-transform rtl:-scale-x-100', collapsed && 'rotate-180')} />
          </button>
          )}
        </div>
      </div>
    </>
  );
}
