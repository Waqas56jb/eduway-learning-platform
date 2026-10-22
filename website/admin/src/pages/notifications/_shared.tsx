import type { ReactNode } from 'react';
import { Bell, ChevronLeft, Mail, MessageCircle, MessageSquare, Smartphone, Wifi, BatteryFull, SignalHigh } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NotifChannel } from '@/types';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { notificationsApi, type TemplateVariableDto } from '@/api/notifications';
import { cn } from '@/utils/cn';
import { LogoMark } from '@/components/layout/Logo';
import type { Tone } from '@/components/ui';

export const CHANNEL_META: Record<NotifChannel, { icon: typeof Bell; color: string; tone: Tone }> = {
  push: { icon: Bell, color: '#2563EB', tone: 'info' },
  in_app: { icon: Smartphone, color: '#7C3AED', tone: 'purple' },
  sms: { icon: MessageSquare, color: '#EA580C', tone: 'warning' },
  whatsapp: { icon: MessageCircle, color: '#16A34A', tone: 'success' },
  email: { icon: Mail, color: '#0B1F3A', tone: 'navy' },
};

export function ChannelIcon({ channel, className }: { channel: NotifChannel; className?: string }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', className)} style={{ background: `${meta.color}1A`, color: meta.color }}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** Channels that render a subject/title line. */
export const HAS_SUBJECT: Record<NotifChannel, boolean> = { push: true, in_app: true, email: true, sms: false, whatsapp: false };

export type VariableSamples = Record<string, { en: string; ar: string }>;

/** Template variable catalogue (ADM-NTT-08) → `{ key: sample }` map + full list. Cached for the session. */
export function useTemplateVariables() {
  const q = useApiQuery(qk.templates.sub('variables'), notificationsApi.variables, { staleTime: 10 * 60_000 });
  const list: TemplateVariableDto[] = q.data ?? [];
  const samples: VariableSamples = Object.fromEntries(list.map((v) => [v.key, v.sample]));
  return { list, samples, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** Replace {variables} with sample values for previews. */
export function renderTemplate(text: string, lang: 'en' | 'ar', samples: VariableSamples = {}) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => samples[k]?.[lang] ?? m);
}

/** Variables referenced in a text. */
export const extractVariables = (...texts: string[]) => [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))];

/** GSM-7 vs UCS-2 segment counting (Arabic forces UCS-2). */
export function smsSegments(text: string) {
  const unicode = [...text].some((c) => c.charCodeAt(0) > 127);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const len = [...text].length;
  return { len, unicode, segments: len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi) };
}

interface PhonePreviewProps {
  channel: NotifChannel;
  lang: 'en' | 'ar';
  subject: string;
  body: string;
  /** Sample values for {variables} (from `useTemplateVariables`). */
  samples?: VariableSamples;
}

/** Phone mockup rendering a template the way students will see it on each channel. */
export function PhonePreview({ channel, lang, subject, body, samples }: PhonePreviewProps) {
  const { t } = useTranslation();
  const rtl = lang === 'ar';
  const s = renderTemplate(subject, lang, samples);
  const b = renderTemplate(body, lang, samples);
  const font = rtl ? 'Tajawal, sans-serif' : 'Inter, sans-serif';
  const appName = rtl ? 'إيدوواي' : 'EDUWAY';

  let screen: ReactNode;
  if (channel === 'push') {
    screen = (
      <div className="flex h-full flex-col bg-gradient-to-b from-[#15325C] via-[#0B1F3A] to-[#081629] px-3 pt-10">
        <div className="text-center text-white">
          <div className="text-5xl font-light tracking-tight" dir="ltr">9:41</div>
          <div className="mt-1 text-xs text-white/70">{rtl ? 'الخميس، 22 تشرين الأول' : 'Thursday, 22 October'}</div>
        </div>
        <div className="mt-8 rounded-2xl bg-white/85 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-[10px] text-[#374151]">
            <LogoMark className="h-4 w-4 rounded" />
            <span className="font-semibold uppercase tracking-wide">{appName}</span>
            <span className="ms-auto">{rtl ? 'الآن' : 'now'}</span>
          </div>
          {s && <div className="mt-1.5 text-[13px] font-semibold text-[#111827]">{s}</div>}
          <div className="mt-0.5 text-[12px] leading-snug text-[#374151]">{b}</div>
        </div>
      </div>
    );
  } else if (channel === 'in_app') {
    screen = (
      <div className="flex h-full flex-col bg-[#F5F3EE]">
        <div className="flex items-center gap-2 bg-[#0B1F3A] px-3 pb-3 pt-8 text-white">
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-bold">{appName}</span>
          <Bell className="ms-auto h-4 w-4 text-[#E6C77A]" />
        </div>
        <div className="space-y-2 p-3">
          <div className="h-16 rounded-xl bg-white/70" />
          <div className="rounded-xl border border-[#C9A24A]/40 bg-white p-3 shadow-md">
            <div className="mb-1 h-1 w-8 rounded-full bg-[#C9A24A]" />
            {s && <div className="text-[13px] font-bold text-[#0B1F3A]">{s}</div>}
            <div className="mt-1 text-[12px] leading-snug text-[#4B5563]">{b}</div>
            <div className="mt-3 inline-block rounded-lg bg-[#0B1F3A] px-3 py-1.5 text-[11px] font-semibold text-white">{rtl ? 'متابعة' : 'Continue'}</div>
          </div>
          <div className="h-24 rounded-xl bg-white/70" />
        </div>
      </div>
    );
  } else if (channel === 'email') {
    screen = (
      <div className="flex h-full flex-col bg-[#F3F4F6]">
        <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-white px-3 pb-2.5 pt-8 text-[#111827]">
          <ChevronLeft className={cn('h-4 w-4 text-[#2563EB]', rtl && '-scale-x-100')} />
          <span className="text-xs text-[#2563EB]">{rtl ? 'البريد الوارد' : 'Inbox'}</span>
        </div>
        <div className="flex-1 overflow-hidden bg-white p-3">
          <div className="text-[13px] font-bold text-[#111827]">{s}</div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[#6B7280]">
            <LogoMark className="h-6 w-6" />
            <span>
              <span className="block font-semibold text-[#111827]">{appName}</span>
              <span dir="ltr">no-reply@eduway.iq</span>
            </span>
          </div>
          <div className="mt-3 rounded-lg border-t-4 border-[#C9A24A] bg-[#FAF8F4] p-3 text-[11.5px] leading-relaxed whitespace-pre-line text-[#374151]">{b}</div>
        </div>
      </div>
    );
  } else {
    const wa = channel === 'whatsapp';
    screen = (
      <div className={cn('flex h-full flex-col', wa ? 'bg-[#EFE7DD]' : 'bg-white')}>
        <div className={cn('flex items-center gap-2 px-3 pb-2.5 pt-8', wa ? 'bg-[#075E54] text-white' : 'border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#111827]')}>
          <ChevronLeft className={cn('h-4 w-4', rtl && '-scale-x-100')} />
          <LogoMark className="h-7 w-7" />
          <span className="text-sm font-semibold">{wa ? appName : 'EDUWAY'}</span>
        </div>
        <div className="flex-1 p-3">
          <div className="mx-auto mb-3 w-fit rounded-md bg-black/5 px-2 py-0.5 text-[10px] text-[#6B7280]">{rtl ? 'اليوم' : 'Today'}</div>
          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-snug whitespace-pre-line shadow-sm',
              wa ? 'rounded-ss-sm bg-white text-[#111827]' : 'rounded-ss-sm bg-[#E5E7EB] text-[#111827]',
            )}
          >
            {b}
            <div className="mt-1 text-end text-[9px] text-[#6B7280]" dir="ltr">
              9:41
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[260px]" aria-label={t('notifications.editor.preview')}>
      <div className="relative rounded-[2.4rem] bg-[#111827] p-2.5 shadow-lift ring-1 ring-black/20">
        <div className="relative h-[500px] overflow-hidden rounded-[1.9rem]" dir={rtl ? 'rtl' : 'ltr'} lang={lang} style={{ fontFamily: font }}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-2 text-[10px] font-semibold" style={{ color: channel === 'push' || channel === 'whatsapp' || channel === 'in_app' ? '#fff' : '#111827' }} dir="ltr">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <SignalHigh className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="absolute left-1/2 top-1.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-[#111827]" />
          {screen}
        </div>
      </div>
    </div>
  );
}
