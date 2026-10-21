import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronsLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { NAV, type NavItem } from '@/routes/nav';
import { useCan } from '@/store/auth';
import { useUi } from '@/store/ui';
import { useIsRtl } from '@/hooks/useLocale';
import { Logo } from './Logo';

const isActivePath = (pathname: string, path: string, end?: boolean) =>
  end || path === '/' ? pathname === path : pathname === path || pathname.startsWith(path + '/');

function itemActive(item: NavItem, pathname: string) {
  if (item.path) return isActivePath(pathname, item.path, item.path === '/');
  return item.children?.some((c) => isActivePath(pathname, c.path, c.end)) ?? false;
}

/** Children whose path is a prefix of another sibling must match exactly (e.g. /questions vs /questions/review). */
function leafActive(pathname: string, item: NavItem, leafPath: string, end?: boolean) {
  if (!end) return isActivePath(pathname, leafPath);
  const deeper = item.children?.some((c) => c.path !== leafPath && isActivePath(pathname, c.path));
  return !deeper && isActivePath(pathname, leafPath);
}

function SidebarItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = itemActive(item, pathname);
  const [open, setOpen] = useState(active);
  const Icon = item.icon;

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const rowCls = (on: boolean) =>
    cn(
      'group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors duration-200',
      on ? 'bg-white/[0.08] text-white' : 'text-white/65 hover:bg-white/[0.05] hover:text-white',
      collapsed && 'justify-center px-0',
    );
  const bar = (on: boolean) =>
    on && <span className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-gold-grad shadow-[0_0_12px_rgba(201,162,74,0.7)]" aria-hidden />;

  if (!item.children) {
    return (
      <NavLink to={item.path!} end onClick={onNavigate} className={rowCls(active)} aria-label={collapsed ? t(`nav.${item.key}`) : undefined}>
        {bar(active)}
        <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-white/55 group-hover:text-white/80')} />
        {!collapsed && <span className="truncate">{t(`nav.${item.key}`)}</span>}
        {collapsed && <Flyout label={t(`nav.${item.key}`)} />}
      </NavLink>
    );
  }

  if (collapsed) {
    return (
      <div className="group/fly relative">
        <NavLink to={item.children[0].path} onClick={onNavigate} className={rowCls(active)} aria-label={t(`nav.${item.key}`)}>
          {bar(active)}
          <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-white/55')} />
        </NavLink>
        {/* Hover flyout with children */}
        <div className="invisible absolute start-full top-0 z-50 ps-3 opacity-0 transition-opacity duration-150 group-hover/fly:visible group-hover/fly:opacity-100 group-focus-within/fly:visible group-focus-within/fly:opacity-100">
          <div className="min-w-[13rem] rounded-xl border border-white/10 bg-[#0E2546] p-1.5 shadow-lift">
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent/80">{t(`nav.${item.key}`)}</div>
            {item.children.map((c) => {
              const on = leafActive(pathname, item, c.path, c.end);
              return (
                <NavLink key={c.path} to={c.path} onClick={onNavigate} className={cn('block rounded-lg px-2.5 py-1.5 text-[13px] transition', on ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
                  {t(`nav.${c.key}`)}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={rowCls(active && !open)}>
        {bar(active && !open)}
        <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-white/55 group-hover:text-white/80')} />
        <span className="flex-1 truncate text-start">{t(`nav.${item.key}`)}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-white/40 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="relative ms-[1.35rem] mt-0.5 space-y-0.5 border-s border-white/10 py-1 ps-3">
              {item.children.map((c) => {
                const on = leafActive(pathname, item, c.path, c.end);
                return (
                  <li key={c.path}>
                    <NavLink
                      to={c.path}
                      onClick={onNavigate}
                      className={cn(
                        'relative flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors duration-200',
                        on ? 'bg-white/[0.08] font-medium text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white',
                      )}
                    >
                      {on && <span className="absolute -start-[13px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" aria-hidden />}
                      <span className="truncate">{t(`nav.${c.key}`)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Flyout({ label }: { label: string }) {
  return (
    <span className="pointer-events-none invisible absolute start-full top-1/2 z-50 ms-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0E2546] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lift ring-1 ring-white/10 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.module, 'view')) })).filter((g) => g.items.length);

  return (
    <nav aria-label="Main" className={cn('scrollbar-none flex-1 pb-6', collapsed ? 'overflow-visible px-3' : 'overflow-y-auto px-3.5')}>
      {groups.map((g) => (
        <div key={g.key} className="mt-5 first:mt-2">
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-white/10" />
          ) : (
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 rtl:tracking-normal">{t(`nav.groups.${g.key}`)}</div>
          )}
          <div className="space-y-0.5">
            {g.items.map((item) => (
              <SidebarItem key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobile = useUi((s) => s.setMobileNav);
  const rtl = useIsRtl();
  const { pathname } = useLocation();

  useEffect(() => setMobile(false), [pathname, setMobile]);

  const frame = 'flex h-full flex-col bg-sidebar bg-[radial-gradient(120%_60%_at_0%_0%,rgba(201,162,74,0.10),transparent_60%)]';

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 start-0 z-40 hidden border-e border-white/5 transition-[width] duration-300 ease-out lg:block',
          collapsed ? 'w-[72px]' : 'w-[260px]',
        )}
      >
        <div className={frame}>
          <div className={cn('flex h-16 shrink-0 items-center border-b border-white/5', collapsed ? 'justify-center px-2' : 'px-5')}>
            <NavLink to="/" aria-label="EDUWAY Admin — Dashboard">
              <Logo collapsed={collapsed} />
            </NavLink>
          </div>
          <SidebarContent collapsed={collapsed} />
          <div className="border-t border-white/5 p-3">
            <button
              onClick={toggle}
              className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-white/50 transition hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}
              aria-label={t('topbar.toggleSidebar')}
            >
              <ChevronsLeft className={cn('h-4 w-4 transition-transform duration-300', collapsed !== rtl && 'rotate-180')} />
              {!collapsed && <span>{t('topbar.toggleSidebar')}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div className="absolute inset-0 bg-[#0B1F3A]/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside
              initial={{ x: rtl ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: rtl ? '100%' : '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="absolute inset-y-0 start-0 w-[280px] max-w-[85vw] shadow-lift"
            >
              <div className={frame}>
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
                  <Logo />
                  <button onClick={() => setMobile(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t('actions.close')}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent collapsed={false} onNavigate={() => setMobile(false)} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
