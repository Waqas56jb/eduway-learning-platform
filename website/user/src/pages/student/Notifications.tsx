import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { BellOff, CheckCheck, ChevronRight, Crown, PlayCircle, Receipt, Sparkles, Timer, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Seo, SkeletonList, Tabs, useMockLoading, useToast } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types';

type Filter = 'all' | 'unread' | 'lesson' | 'exam' | 'payment' | 'subscription';
type Group = 'today' | 'week' | 'earlier';

const TYPE_STYLE: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  lesson: { icon: PlayCircle, className: 'bg-primary/10 text-primary' },
  exam: { icon: Timer, className: 'bg-warning/15 text-[#B45309]' },
  payment: { icon: Receipt, className: 'bg-success/10 text-success' },
  subscription: { icon: Crown, className: 'bg-accent/15 text-[#8A6A1F]' },
  system: { icon: Sparkles, className: 'bg-gold-grad text-primary' },
};

function groupOf(iso: string, now: Date): Group {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return 'today';
  if (d.getTime() >= startOfToday - 6 * 86_400_000) return 'week';
  return 'earlier';
}

export default function Notifications() {
  const { t } = useTranslation();
  const { l, fmtRelative, fmtDate } = useLang();
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useStudent();
  const toast = useToast();
  const navigate = useNavigate();
  const ready = useMockLoading(600);
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = useMemo(() => [...notifications].sort((a, b) => b.date.localeCompare(a.date)), [notifications]);

  // Mock timestamps are fixed; if the newest one lies in the future of this device's clock, shift the
  // whole feed back so it never reads "in 10 hours" while keeping the relative spacing intact.
  const shiftMs = useMemo(() => {
    const newest = sorted.length ? new Date(sorted[0].date).getTime() : 0;
    return Math.max(0, newest - Date.now() + 20 * 60_000);
  }, [sorted]);
  const shown = useCallback((iso: string) => new Date(new Date(iso).getTime() - shiftMs).toISOString(), [shiftMs]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: sorted.length, unread: 0, lesson: 0, exam: 0, payment: 0, subscription: 0 };
    for (const n of sorted) {
      if (!n.read) c.unread++;
      if (n.type in c) c[n.type as Filter]++;
    }
    return c;
  }, [sorted]);

  const visible = sorted.filter((n) =>
    filter === 'all' ? true : filter === 'unread' ? !n.read : n.type === filter,
  );

  const groups = useMemo(() => {
    const now = new Date();
    const out: { id: Group; items: AppNotification[] }[] = [
      { id: 'today', items: [] },
      { id: 'week', items: [] },
      { id: 'earlier', items: [] },
    ];
    for (const n of visible) out.find((g) => g.id === groupOf(shown(n.date), now))?.items.push(n);
    return out.filter((g) => g.items.length);
  }, [visible, shown]);

  const open = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id);
    if (n.link) navigate(n.link);
  };

  const filters: Filter[] = ['all', 'unread', 'lesson', 'exam', 'payment', 'subscription'];

  return (
    <>
      <Seo title={t('account.notifications.seoTitle')} description={t('account.notifications.seoDescription')} />
      <PageHeader
        title={t('account.notifications.title')}
        subtitle={
          unreadCount > 0 ? t('account.notifications.subtitle', { count: unreadCount }) : t('account.notifications.allCaught')
        }
        actions={
          <Button
            variant="outline"
            disabled={unreadCount === 0}
            leftIcon={<CheckCheck className="h-4 w-4" aria-hidden />}
            onClick={() => {
              markAllNotificationsRead();
              toast.success(t('account.notifications.markedAll'));
            }}
          >
            {t('account.notifications.markAll')}
          </Button>
        }
      />

      <Tabs<Filter>
        items={filters.map((f) => ({ id: f, label: t(`account.notifications.filters.${f}`), count: counts[f] }))}
        value={filter}
        onChange={setFilter}
        ariaLabel={t('account.notifications.filtersLabel')}
        className="mb-6"
      />

      {!ready ? (
        <SkeletonList rows={5} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-7 w-7" />}
          title={filter === 'unread' ? t('account.notifications.emptyUnreadTitle') : t('account.notifications.emptyTitle')}
          body={filter === 'unread' ? t('account.notifications.emptyUnreadBody') : t('account.notifications.emptyBody')}
        />
      ) : (
        <LayoutGroup>
          <div className="space-y-8" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              {groups.map((g) => (
                <motion.section
                  key={g.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  aria-labelledby={`group-${g.id}`}
                >
                  <h2
                    id={`group-${g.id}`}
                    className="mb-3 font-sans text-xs font-bold uppercase tracking-wider text-muted rtl:font-display"
                  >
                    {t(`account.notifications.groups.${g.id}`)}
                  </h2>
                  <ul className="card divide-y divide-primary/5 overflow-hidden p-0">
                    <AnimatePresence initial={false}>
                      {g.items.map((n, i) => {
                        const style = TYPE_STYLE[n.type];
                        const Icon = style.icon;
                        return (
                          <motion.li
                            key={n.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 6) * 0.04 } }}
                            exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                          >
                            <button
                              type="button"
                              onClick={() => open(n)}
                              className={cn(
                                'group relative flex w-full items-start gap-4 px-4 py-4 text-start transition-colors sm:px-5',
                                n.read ? 'bg-white hover:bg-cream/70' : 'bg-accent/[0.06] hover:bg-accent/10',
                              )}
                            >
                              {!n.read && <span className="absolute inset-y-0 start-0 w-1 bg-accent" aria-hidden />}
                              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', style.className)}>
                                <Icon className="h-5 w-5" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-3">
                                  <span className={cn('text-sm text-primary', n.read ? 'font-semibold' : 'font-bold')}>
                                    {l(n.title)}
                                  </span>
                                  <time
                                    dateTime={shown(n.date)}
                                    title={fmtDate(shown(n.date), { dateStyle: 'full', timeStyle: 'short' })}
                                    className="shrink-0 text-xs text-muted"
                                  >
                                    {fmtRelative(shown(n.date))}
                                  </time>
                                </span>
                                <span className="mt-1 block text-sm leading-relaxed text-muted">{l(n.body)}</span>
                              </span>
                              <span className="flex shrink-0 flex-col items-center gap-3 self-stretch">
                                {!n.read ? (
                                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_4px_rgba(201,162,74,0.18)]">
                                    <span className="sr-only">{t('account.notifications.unread')}</span>
                                  </span>
                                ) : (
                                  <span className="mt-1.5 h-2.5 w-2.5" aria-hidden />
                                )}
                                {n.link && (
                                  <ChevronRight
                                    className="h-4 w-4 text-muted/60 transition group-hover:translate-x-0.5 group-hover:text-primary rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                                    aria-hidden
                                  />
                                )}
                              </span>
                            </button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      )}
    </>
  );
}
