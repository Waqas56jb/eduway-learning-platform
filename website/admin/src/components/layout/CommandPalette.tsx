import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CornerDownLeft, Languages, LogOut, Moon, Search, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { isolatePhone } from '@/utils/phone';
import { FLAT_PAGES } from '@/routes/nav';
import { useAuth, useCan } from '@/store/auth';
import { useUi } from '@/store/ui';
import { useLang } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { useApiQuery } from '@/api/hooks';
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import type { Localized } from '@/api/types';

interface SearchDto {
  students?: { id: string; name: Localized; mobile: string; avatarUrl: string | null }[];
  lessons?: { id: string; title: Localized; subjectSlug: string; subjectName: Localized; status?: string; thumbnail: string }[];
}

interface Entry {
  id: string;
  group: 'pages' | 'students' | 'lessons' | 'commands';
  label: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** ⌘K / Ctrl+K global search across pages, students, lessons and commands. */
export function CommandPalette() {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const logout = useAuth((s) => s.logout);
  const can = useCan();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 250);
  const scopes = [can('users', 'view') && 'students', can('content', 'view') && 'lessons'].filter(Boolean) as string[];
  // SRC-01: server-side search scoped by role (students + lessons, top 5 each).
  const search = useApiQuery(qk.search(dq, scopes), () => api.get<SearchDto>('/search', { q: dq, scopes, limit: 5 }), {
    enabled: open && dq.length >= 2 && scopes.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    meta: { silentError: true },
  });
  const found = dq.length >= 2 ? search.data : undefined;
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      setOpen(false);
    };
    const query = q.trim().toLowerCase();
    const match = (...s: (string | null | undefined)[]) => !query || s.some((x) => x?.toLowerCase().includes(query));

    const pages: Entry[] = FLAT_PAGES.filter((p) => can(p.module, 'view'))
      .map((p) => ({
        id: `p:${p.path}`,
        group: 'pages' as const,
        label: t(`nav.${p.key}`),
        sub: p.parentKey ? t(`nav.${p.parentKey}`) : t(`nav.groups.${p.group}`),
        icon: <p.icon className="h-4 w-4" />,
        run: go(p.path),
      }))
      .filter((e) => match(e.label, e.sub));

    const studs: Entry[] =
      query && can('users', 'view')
        ? (found?.students ?? []).map((s) => ({ id: `s:${s.id}`, group: 'students' as const, label: s.name[lang], sub: isolatePhone(s.mobile), icon: <User className="h-4 w-4" />, run: go(`/users/${s.id}`) }))
        : [];

    const less: Entry[] =
      query && can('content', 'view')
        ? (found?.lessons ?? []).map((l) => ({
            id: `l:${l.id}`,
            group: 'lessons' as const,
            label: l.title[lang],
            sub: l.status ? `${l.subjectName[lang]} · ${t(`status.${l.status}`)}` : l.subjectName[lang],
            icon: <BookOpen className="h-4 w-4" />,
            run: go(`/content/lessons/${l.id}`),
          }))
        : [];

    const cmds: Entry[] = [
      { id: 'c:theme', group: 'commands' as const, label: t('palette.toggleTheme'), icon: <Moon className="h-4 w-4" />, run: () => { toggleTheme(); setOpen(false); } },
      { id: 'c:lang', group: 'commands' as const, label: t('palette.switchLang'), icon: <Languages className="h-4 w-4" />, run: () => { i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar'); setOpen(false); } },
      { id: 'c:logout', group: 'commands' as const, label: t('actions.logout'), icon: <LogOut className="h-4 w-4" />, run: () => { logout(); setOpen(false); navigate('/login'); } },
    ].filter((e) => match(e.label));

    return [...pages.slice(0, query ? 8 : 6), ...studs, ...less, ...cmds];
  }, [q, found, can, t, lang, navigate, setOpen, toggleTheme, i18n, logout]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[idx]?.run();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let lastGroup = '';
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-[#0B1F3A]/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('topbar.search')}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
            onKeyDown={onKey}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-5 w-5 text-accent" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('palette.placeholder')}
                className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={entries[idx] ? `pal-${idx}` : undefined}
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">ESC</kbd>
            </div>
            <div ref={list} id="palette-list" role="listbox" className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
              {entries.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted">{t('palette.noMatch', { q })}</div>}
              {entries.map((e, i) => {
                const header = e.group !== lastGroup ? t(`palette.${e.group}`) : null;
                lastGroup = e.group;
                return (
                  <div key={e.id}>
                    {header && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted first:pt-1">{header}</div>}
                    <button
                      id={`pal-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={i === idx}
                      onMouseMove={() => setIdx(i)}
                      onClick={e.run}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition-colors', i === idx ? 'bg-accent/10 text-primary' : 'text-ink')}
                    >
                      <span className={cn('grid h-8 w-8 place-items-center rounded-lg', i === idx ? 'bg-accent/15 text-accent' : 'bg-ink/5 text-muted')}>{e.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.label}</span>
                        {e.sub && <span className="block truncate text-xs text-muted">{e.sub}</span>}
                      </span>
                      {i === idx && <CornerDownLeft className="h-4 w-4 text-muted" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">{t('palette.hint')}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
