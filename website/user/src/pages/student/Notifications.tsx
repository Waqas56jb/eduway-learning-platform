import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { BellOff, CheckCheck, ChevronRight, Crown, PlayCircle, Receipt, Sparkles, Timer, Trash2, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  notificationHref,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/api/notifications';
import { Button, EmptyState, ErrorState, PageHeader, Seo, SkeletonList, Tabs, useToast } from '@/components/ui';
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
  const { unreadCount } = useStudent();
  const toast = useToast();
  const navigate = useNavigate();
  // NTF-01 (newest 100; tabs filter client-side so read/unread changes animate in place), NTF-03/04/05.
  const listQ = useNotifications('all', 100);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const ready = !listQ.isLoading;
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = useMemo(() => [...(listQ.data?.items ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [listQ.data]);

  // Clamp server timestamps that are slightly ahead of this device's clock (never "in 2 minutes").
  const shown = useCallback((iso: string) => (new Date(iso).getTime() > Date.now() ? new Date().toISOString() : iso), []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: sorted.length, unread: 0, lesson: 0, exam: 0, payment: 0, subscription: 0 };
    for (const n of sorted) {
      if (!n.read) c.unread++;
      if (n.type in c) c[n.type as Filter]++;
    }
    // Server totals (meta.counts) win when the feed is longer than the loaded page.
    const m = listQ.data?.meta.counts;
    if (m) for (const k of Object.keys(c) as Filter[]) if (typeof m[k] === 'number') c[k] = Math.max(c[k], m[k]);
    return c;
  }, [sorted, listQ.data]);

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
    if (!n.read) markRead.mutate(n.id);
    if (n.target?.kind && n.target.kind !== 'none' && n.target.kind !== 'notifications') navigate(notificationHref(n));
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
            loading={markAll.isPending}
            onClick={() => markAll.mutate(undefined, { onSuccess: () => toast.success(t('account.notifications.markedAll')) })}
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

      {listQ.isError ? (
        <ErrorState onRetry={() => void listQ.refetch()} />
      ) : !ready ? (
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
                            <div className="group/row relative">
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
                                {n.target?.kind && n.target.kind !== 'none' && (
                                  <ChevronRight
                                    className="h-4 w-4 text-muted/60 transition group-hover:translate-x-0.5 group-hover:text-primary rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                                    aria-hidden
                                  />
                                )}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => remove.mutate(n.id)}
                              aria-label={t('account.notifications.delete')}
                              title={t('account.notifications.delete')}
                              className="absolute bottom-3 end-3 rounded-lg p-1.5 text-muted/60 opacity-0 transition hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover/row:opacity-100 sm:end-4"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                            </div>
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
