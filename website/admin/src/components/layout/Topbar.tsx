import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronDown, FlaskConical, LogOut, Menu as MenuIcon, Moon, Search, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { fmtRelative } from '@/utils/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useCurrentAdmin, useCurrentRole, roleFromDto } from '@/store/auth';
import { adminMeApi } from '@/api/auth';
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import type { AdminInboxNotification, RoleDto } from '@/api/types';
import { useUi } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { Avatar } from '@/components/ui/Avatar';
import { MenuDivider, MenuItem, MenuLabel, Popover } from '@/components/ui/Menu';
import { LanguageSwitcher } from './LanguageSwitcher';

const KIND_DOT = { info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger' } as const;

function NotificationsBell() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: qk.inbox,
    queryFn: () => adminMeApi.inbox({ limit: 20 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    meta: { silentError: true },
  });
  const items = (inbox.data?.items ?? []).map((n: AdminInboxNotification) => ({
    ...n,
    title_en: n.title.en,
    title_ar: n.title.ar,
    body_en: n.body.en,
    body_ar: n.body.ar,
  }));
  const unread = inbox.data?.unreadCount ?? 0;
  const setUnread = (id: string | null, unreadCount: number) =>
    qc.setQueryData(qk.inbox, (old: typeof inbox.data) =>
      old ? { unreadCount, items: old.items.map((n) => (id === null || n.id === id ? { ...n, read: true } : n)) } : old,
    );
  const markRead = (id: string) => adminMeApi.markRead(id).then((r) => setUnread(id, r.unreadCount)).catch(() => undefined);
  const markAll = () => adminMeApi.markAllRead().then(() => setUnread(null, 0)).catch(() => undefined);

  return (
    <Popover
      panelClassName="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-label={`${t('topbar.notifications')}${unread ? ` (${unread})` : ''}`} className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink">
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && <span className="absolute end-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-surface">{unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">{t('topbar.notifications')}</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-accent hover:underline">
                {t('topbar.markAllRead')}
              </button>
            )}
          </div>
          <ul className="scrollbar-thin max-h-[22rem] overflow-y-auto p-1.5">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('topbar.noNotifications')}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    navigate(n.href);
                    close();
                  }}
                  className={cn('flex w-full gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-ink/5', !n.read && 'bg-accent/[0.05]')}
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[n.kind], n.read && 'opacity-30')} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', n.read ? 'text-ink/70' : 'font-semibold text-ink')}>{L(n, 'title')}</span>
                    <span className="mt-0.5 block text-xs text-muted">{L(n, 'body')}</span>
                    <span className="mt-1 block text-[11px] text-muted/80">{fmtRelative(n.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const admin = useCurrentAdmin();
  const role = useCurrentRole();
  const realCanSecurity = useAuth((s) => !!s.me && (s.me.role?.key === 'super_admin' || !!s.me.permissions?.includes('security.view')));
  const rolesQ = useQuery({
    queryKey: qk.roles.list({ menu: true }),
    queryFn: () => api.list<RoleDto>('/admin/roles', { pageSize: 100 }),
    enabled: realCanSecurity,
    staleTime: 5 * 60_000,
    meta: { silentError: true },
  });
  const roleDtos = rolesQ.data?.items ?? [];
  const roles = roleDtos.map(roleFromDto);
  const previewRoleId = useAuth((s) => s.previewRoleId);
  const setPreview = useAuth((s) => s.setPreviewRole);
  const logout = useAuth((s) => s.logout);
  if (!admin) return null;

  return (
    <Popover
      panelClassName="w-72"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2.5 rounded-lg py-1 pe-2 ps-1 transition hover:bg-ink/5">
          <Avatar name={admin.name} src={admin.avatar} size="sm" />
          <span className="hidden text-start leading-tight xl:block">
            <span className="block text-[13px] font-semibold text-ink">{L(admin, 'name') !== '—' ? L(admin, 'name') : admin.name}</span>
            <span className={cn('block text-[11px]', previewRoleId ? 'font-semibold text-accent' : 'text-muted')}>{role ? L(role, 'name') : ''}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted xl:block" />
        </button>
      )}
    >
      {(close) => (
        <div role="menu">
          <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-1.5">
            <Avatar name={admin.name} src={admin.avatar} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{admin.name}</div>
              <div className="truncate text-xs text-muted">{admin.email}</div>
            </div>
          </div>
          <MenuDivider />
          <MenuItem icon={<UserRound />} onClick={() => { navigate('/profile'); close(); }}>
            {t('topbar.profile')}
          </MenuItem>
          {roles.length > 0 && (
          <>
          <MenuDivider />
          <MenuLabel>
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="h-3 w-3" /> {t('topbar.previewAs')} · {t('topbar.devTool')}
            </span>
          </MenuLabel>
          {roles.map((r) => {
            const active = (previewRoleId ?? admin.roleId) === r.id;
            return (
              <MenuItem
                key={r.id}
                active={active}
                icon={active ? <Check className="!text-accent" /> : <span className="block h-4 w-4" />}
                onClick={() => {
                  setPreview(r.id === admin.roleId ? null : (roleDtos.find((d) => d.id === r.id) ?? null));
                  toast.success(t('topbar.roleSwitched', { role: L(r, 'name') }));
                  close();
                }}
              >
                {L(r, 'name')}
              </MenuItem>
            );
          })}
          </>
          )}
          <MenuDivider />
          <MenuItem
            danger
            icon={<LogOut />}
            onClick={() => {
              logout();
              qc.clear();
              toast(t('auth.loggedOut'));
              navigate('/login');
            }}
          >
            {t('actions.logout')}
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

export function Topbar() {
  const { t } = useTranslation();
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const setMobile = useUi((s) => s.setMobileNav);
  const setPalette = useUi((s) => s.setPalette);
  const previewRoleId = useAuth((s) => s.previewRoleId);
  const role = useCurrentRole();
  const L = useLocalize();
  const setPreview = useAuth((s) => s.setPreviewRole);
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      {previewRoleId && role && (
        <div className="flex items-center justify-center gap-2 bg-gold-grad px-4 py-1 text-[11px] font-semibold text-[#0B1F3A]">
          <FlaskConical className="h-3.5 w-3.5" />
          {t('topbar.roleSwitched', { role: L(role, 'name') })}
          <button onClick={() => setPreview(null)} className="ms-2 rounded bg-[#0B1F3A]/10 px-1.5 py-0.5 hover:bg-[#0B1F3A]/20">
            {t('actions.reset')}
          </button>
        </div>
      )}
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 lg:px-8">
        <button onClick={() => setMobile(true)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink lg:hidden" aria-label={t('topbar.openMenu')}>
          <MenuIcon className="h-5 w-5" />
        </button>

        <button
          onClick={() => setPalette(true)}
          className="group flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-start text-sm text-muted transition hover:border-accent/50"
          aria-label={t('topbar.search')}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 truncate sm:block">{t('topbar.search')}</span>
          <span className="flex-1 truncate sm:hidden">{t('topbar.searchShort')}</span>
          <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted sm:inline" dir="ltr">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink" aria-label={t('topbar.toggleTheme')} title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}>
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <NotificationsBell />
          <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
