import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, CreditCard, LogOut, Menu, PlayCircle, Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Badge, LogoMark } from '@/components/ui';
import { useSubjectLookup } from '@/api/catalog';
import { notificationHref, useMarkNotificationRead, useNotifications } from '@/api/notifications';
import { useLessonSearch } from '@/api/search';
import { normalizeMobile } from '@/components/auth/mobile';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

function useClickOutside(ref: React.RefObject<HTMLElement>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOut();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [ref, onOut, active]);
}

const dropdown = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
  transition: { duration: 0.18 },
};

function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const subjectOf = useSubjectLookup();

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  // SRC-01 ?scopes=lessons&limit=6
  const search = useLessonSearch(debounced);
  const results = debounced.length >= 2 ? (search.data?.lessons ?? []) : [];
  const searching = q.trim().length >= 2 && (search.isFetching || debounced !== q.trim());

  const go = (id: string) => {
    navigate(`/student/lesson/${id}`);
    setQ('');
    setOpen(false);
    onDone?.();
  };

  return (
    <div ref={ref} className="relative w-full">
      <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.max(0, Math.min(a + 1, results.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            go(results[active].id);
          }
        }}
        placeholder={t('student.topbar.searchPlaceholder')}
        aria-label={t('student.topbar.searchLabel')}
        role="combobox"
        aria-expanded={open && q.length >= 2}
        aria-controls="topbar-search-results"
        className="h-11 w-full rounded-xl border border-primary/10 bg-cream/70 ps-11 pe-4 text-sm transition [&::-webkit-search-cancel-button]:appearance-none placeholder:text-muted/80 focus:border-accent focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15"
      />
      <AnimatePresence>
        {open && q.trim().length >= 2 && (
          <motion.div {...dropdown} id="topbar-search-results" role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-primary/5 bg-white p-2 shadow-lift">
            {searching && results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">{t('common.loading')}</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">{t('student.topbar.searchEmpty', { q: q.trim() })}</p>
            ) : (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t('student.topbar.searchResults')}</p>
                {results.map((r, i) => {
                  const s = subjectOf(r.subjectSlug);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r.id)}
                      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start', i === active && 'bg-primary/5')}
                    >
                      <PlayCircle className="h-5 w-5 shrink-0" style={{ color: s?.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-primary">{l(r.title)}</span>
                        <span className="block text-xs text-muted">{l(r.subjectName ?? s?.name)}</span>
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationsMenu() {
  const { t } = useTranslation();
  const { l, fmtRelative } = useLang();
  const { unreadCount } = useStudent();
  const [open, setOpen] = useState(false);
  // NTF-01 ?limit=5 (loaded when the menu opens)
  const list = useNotifications('all', 5);
  const markRead = useMarkNotificationRead();
  const notifications = list.data?.items ?? [];
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  // English has no _zero plural form, so "no unread" needs an explicit key.
  const unreadText = unreadCount === 0 ? t('student.topbar.noUnread') : t('student.topbar.unread', { count: unreadCount });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${t('student.topbar.notifications')} — ${unreadText}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-primary transition hover:bg-primary/5 sm:h-11 sm:w-11"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute end-1.5 top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...dropdown} className="fixed inset-x-3 top-[4.25rem] z-50 rounded-2xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[22rem] border border-primary/5 bg-white p-2 shadow-lift">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="font-semibold text-primary">{t('student.topbar.notifications')}</p>
              <Badge tone="gold">{unreadText}</Badge>
            </div>
            {list.isLoading && <p className="px-3 py-4 text-sm text-muted">{t('common.loading')}</p>}
            <ul className="max-h-80 overflow-y-auto">
              {notifications.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <Link
                    to={notificationHref(n)}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                      setOpen(false);
                    }}
                    className="flex gap-3 rounded-xl px-3 py-2.5 transition hover:bg-primary/5"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-primary">{l(n.title)}</span>
                      <span className="line-clamp-2 block text-xs text-muted">{l(n.body)}</span>
                      <span className="mt-0.5 block text-[11px] text-muted/80">{fmtRelative(n.date, { clampFuture: true })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              to="/student/notifications"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-accent hover:bg-accent/5"
            >
              {t('common.viewAll')}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  if (!user) return null;

  const items = [
    { to: '/student/profile', icon: UserRound, label: t('student.nav.profile') },
    { to: '/student/subscription', icon: CreditCard, label: t('student.nav.subscription') },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('student.topbar.userMenu')}
        className="flex h-10 min-w-0 items-center gap-2.5 rounded-xl p-1 transition hover:bg-primary/5 sm:h-11 md:pe-2"
      >
        <Avatar src={user.avatar} alt={l(user.name)} size={36} className="shrink-0 ring-2 ring-accent/40" />
        <span className="hidden min-w-0 max-w-[11rem] text-start md:block xl:max-w-[14rem]">
          <span className="block truncate text-sm font-semibold leading-tight text-primary" title={l(user.name)}>
            {l(user.name)}
          </span>
          <span className="block truncate text-xs text-muted">
            <bdi dir="ltr" className="num">
              {normalizeMobile(user.mobile)}
            </bdi>
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted md:block" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...dropdown} role="menu" className="absolute end-0 top-full z-50 mt-2 w-[min(15rem,calc(100vw-1.5rem))] rounded-2xl border border-primary/5 bg-white p-2 shadow-lift">
            {items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
              >
                <it.icon className="h-4 w-4 text-muted" aria-hidden />
                {it.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-primary/5" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void logout().then(() => navigate('/'));
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/5"
            >
              <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              {t('student.nav.logout')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const [mobileSearch, setMobileSearch] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-primary/5 bg-cream/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:h-20 lg:px-8">
        {/* Start edge: drawer toggle + brand (below lg, where the sidebar is hidden) */}
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label={t('nav.openMenu')}
            aria-haspopup="dialog"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary transition hover:bg-primary/5 sm:h-11 sm:w-11 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Link to="/student/dashboard" className="shrink-0 max-[359px]:hidden lg:hidden" aria-label={t('brand.logoAlt')}>
          <LogoMark />
        </Link>
        {/* Search takes all the remaining space (its field is capped for readability) */}
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="max-w-xl">
            <SearchBox />
          </div>
        </div>
        {/* End edge (right in LTR, left in RTL): always flush to the corner */}
        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setMobileSearch(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition hover:bg-primary/5 sm:h-11 sm:w-11 md:hidden"
            aria-label={t('student.topbar.searchLabel')}
          >
            <Search className="h-5 w-5" />
          </button>
          <LanguageSwitcher />
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>
      <AnimatePresence>
        {mobileSearch && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 top-0 z-50 flex h-16 items-center gap-2 bg-white px-3 shadow-soft sm:px-6 md:hidden"
          >
            <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              aria-label={t('common.close')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-primary/5"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
