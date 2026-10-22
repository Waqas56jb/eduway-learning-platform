import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, LogOut, MessageCircle, QrCode, RefreshCw, Send, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWhatsAppConnect, useWhatsAppDisconnect, useWhatsAppQr, useWhatsAppStatus, useWhatsAppTestSend, type WhatsAppStatus } from '@/api/whatsapp';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Field, PhoneInput, Segmented, Skeleton, SkeletonCard, Textarea, useConfirm, type Tone } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtRelative } from '@/utils/format';
import { formatPhone, isValidPhone, toE164 } from '@/utils/phone';
import { ReadOnlyNotice, Section, useCanEditSettings } from './_shared';

const STATUS_TONE: Record<WhatsAppStatus, Tone> = { connected: 'success', qr_pending: 'warning', connecting: 'info', disconnected: 'neutral' };
const KNOWN_ERRORS = ['logged_out', 'logged_out_by_admin', 'stopped_by_admin', 'qr_expired', 'replaced_by_another_client', 'forbidden', 'multidevice_mismatch', 'bad_session'];

export default function WhatsAppSettings() {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const editable = useCanEditSettings();
  const q = useWhatsAppStatus();
  const s = q.data;
  const pendingQr = editable && s?.status === 'qr_pending';
  const qr = useWhatsAppQr(pendingQr);
  const connect = useWhatsAppConnect();
  const disconnect = useWhatsAppDisconnect();
  const testSend = useWhatsAppTestSend();

  const [connectQr, setConnectQr] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<'ar' | 'en'>(i18n.language === 'en' ? 'en' : 'ar');
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');

  // The QR returned by POST /connect shows instantly; polling takes over from there.
  useEffect(() => {
    if (s?.status !== 'qr_pending') setConnectQr(null);
  }, [s?.status]);
  const qrImage = (pendingQr && qr.data?.qr) || connectQr;

  const onConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (res) => setConnectQr(res.qr),
    });

  const onDisconnect = async () => {
    const ok = await confirm({
      title: t('whatsapp.disconnectConfirmTitle'),
      body: t('whatsapp.disconnectConfirmBody'),
      tone: 'danger',
      confirmText: t('whatsapp.disconnect'),
    });
    if (ok) disconnect.mutate(true);
  };

  const phoneOk = isValidPhone(phone);
  const onTestSend = () => {
    if (!phoneOk) return;
    testSend.mutate({ phone: toE164(phone) ?? phone.trim(), ...(text.trim() ? { text: text.trim() } : {}) });
  };

  const status = s?.status ?? 'disconnected';
  const busy = connect.isPending || disconnect.isPending;
  const errorKey = s?.lastError && KNOWN_ERRORS.includes(s.lastError) ? s.lastError : s?.lastError ? 'other' : null;

  return (
    <div>
      <PageHeader
        title={t('whatsapp.title')}
        subtitle={t('whatsapp.subtitle')}
        meta={s ? <Badge tone={STATUS_TONE[status]} dot>{t(`whatsapp.status.${status}`)}</Badge> : undefined}
      />
      {!editable && <ReadOnlyNotice />}
      {q.error && !s ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading || !s ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={8} className="xl:col-span-2" />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {(!s.provider.configured || !s.provider.selected) && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm text-ink/80">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{!s.provider.configured ? t('whatsapp.notConfigured') : t('whatsapp.notSelected', { provider: s.provider.active })}</span>
              </div>
            )}

            <Section
              title={t('whatsapp.connection')}
              subtitle={t('whatsapp.connectionHint')}
              icon={<Smartphone className="h-4 w-4" />}
              action={
                editable && s.provider.configured ? (
                  status === 'disconnected' ? (
                    <Button size="sm" onClick={onConnect} loading={connect.isPending} disabled={busy} icon={<Link2 className="h-4 w-4" />}>
                      {t('whatsapp.connect')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={onDisconnect} loading={disconnect.isPending} disabled={busy} icon={<LogOut className="h-4 w-4" />}>
                      {status === 'connected' ? t('whatsapp.disconnect') : t('whatsapp.cancel')}
                    </Button>
                  )
                ) : undefined
              }
            >
              <ul className="grid gap-3 text-sm sm:grid-cols-2">
                <li className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
                  <span className="text-muted">{t('whatsapp.statusLabel')}</span>
                  <Badge tone={STATUS_TONE[status]} dot>
                    {t(`whatsapp.status.${status}`)}
                  </Badge>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
                  <span className="text-muted">{t('whatsapp.since')}</span>
                  <span className="font-medium" title={fmtDateTime(s.since)}>
                    {fmtRelative(s.since)}
                  </span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
                  <span className="text-muted">{t('whatsapp.linkedNumber')}</span>
                  <span className="font-semibold num" dir="ltr">
                    {s.phone ? formatPhone(s.phone) : '—'}
                  </span>
                </li>
                <li className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
                  <span className="text-muted">{t('whatsapp.profileName')}</span>
                  <span className="truncate font-medium">{s.displayName ?? '—'}</span>
                </li>
              </ul>

              {errorKey && status !== 'connected' && (
                <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
                  {t(`whatsapp.errors.${errorKey}`, { code: s.lastError })}
                </p>
              )}
              {s.owner === 'other' && <p className="text-xs text-muted">{t('whatsapp.otherInstance')}</p>}

              {status === 'connected' && (
                <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/[0.07] p-4">
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-ink">{t('whatsapp.connectedTitle', { phone: isolatePhone(s.phone) })}</div>
                    <div className="text-muted">{t('whatsapp.connectedHint', { date: fmtDateTime(s.connectedAt) })}</div>
                  </div>
                </div>
              )}

              {status === 'qr_pending' && editable && (
                <div className="grid items-center gap-6 rounded-2xl border border-line p-4 md:grid-cols-[auto,1fr]">
                  <div className="mx-auto grid h-64 w-64 place-items-center overflow-hidden rounded-xl bg-white p-2 ring-1 ring-line">
                    {qrImage ? <img src={qrImage} alt={t('whatsapp.qrAlt')} className="h-full w-full" /> : <Skeleton className="h-full w-full" />}
                  </div>
                  <div className="space-y-3 text-sm">
                    <h3 className="flex items-center gap-2 font-semibold text-ink">
                      <QrCode className="h-4 w-4" /> {t('whatsapp.scanTitle')}
                    </h3>
                    <ol className="list-decimal space-y-1.5 ps-5 text-ink/80">
                      <li>{t('whatsapp.scanStep1')}</li>
                      <li>{t('whatsapp.scanStep2')}</li>
                      <li>{t('whatsapp.scanStep3')}</li>
                      <li>{t('whatsapp.scanStep4')}</li>
                    </ol>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin [animation-duration:3s]" /> {t('whatsapp.qrAutoRefresh')}
                    </p>
                  </div>
                </div>
              )}

              {status === 'connecting' && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <RefreshCw className="h-4 w-4 animate-spin" /> {t('whatsapp.connectingHint')}
                </p>
              )}

              {status === 'disconnected' && editable && s.provider.configured && (
                <p className="text-sm text-muted">{t('whatsapp.disconnectedHint')}</p>
              )}
            </Section>

            <Section title={t('whatsapp.testTitle')} subtitle={t('whatsapp.testHint')} icon={<Send className="h-4 w-4" />}>
              <fieldset disabled={!editable || status !== 'connected'} className="grid gap-4 sm:grid-cols-2">
                <Field label={t('whatsapp.testPhone')} hint={t('whatsapp.testPhoneHint')} error={phone && !phoneOk ? t('whatsapp.testPhoneInvalid') : undefined}>
                  <PhoneInput value={phone} invalid={!!phone && !phoneOk} onChange={setPhone} />
                </Field>
                <Field label={t('whatsapp.testText')} hint={t('whatsapp.testTextHint')} className="sm:col-span-2">
                  <Textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('whatsapp.testTextPlaceholder')} />
                </Field>
                <div className="sm:col-span-2">
                  <Button onClick={onTestSend} loading={testSend.isPending} disabled={!phoneOk || status !== 'connected'} icon={<Send className="h-4 w-4" />}>
                    {t('whatsapp.testSend')}
                  </Button>
                  {status !== 'connected' && <span className="ms-3 text-xs text-muted">{t('whatsapp.testNeedsConnection')}</span>}
                </div>
              </fieldset>
            </Section>
          </div>

          <div className="space-y-6">
            <Section
              title={t('whatsapp.previewTitle')}
              subtitle={t('whatsapp.previewHint', { minutes: Math.max(1, Math.round(s.otpPreview.expirySeconds / 60)) })}
              icon={<MessageCircle className="h-4 w-4" />}
              action={
                <Segmented
                  size="sm"
                  value={previewLang}
                  onChange={setPreviewLang}
                  options={[
                    { value: 'ar', label: t('whatsapp.previewAr') },
                    { value: 'en', label: t('whatsapp.previewEn') },
                  ]}
                />
              }
            >
              <div className="rounded-2xl bg-[#E5DDD5] p-4 dark:bg-[#0B141A]">
                <div
                  dir="auto"
                  className={cn(
                    'max-w-[92%] whitespace-pre-line rounded-xl rounded-ss-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#111B21] shadow-sm dark:bg-[#202C33] dark:text-[#E9EDEF]',
                  )}
                >
                  <div className="mb-1 text-xs font-semibold text-[#008069] dark:text-[#25D366]">{s.phone ? <span dir="ltr">{formatPhone(s.phone)}</span> : 'EDUWAY'}</div>
                  {previewLang === 'ar' ? s.otpPreview.ar : s.otpPreview.en}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted">{t('whatsapp.previewFallback', { provider: s.provider.smsFallback })}</p>
            </Section>

            <Section title={t('whatsapp.warningTitle')} icon={<AlertTriangle className="h-4 w-4" />}>
              <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink/80">
                <li>{t('whatsapp.warning1')}</li>
                <li>{t('whatsapp.warning2')}</li>
                <li>{t('whatsapp.warning3')}</li>
              </ul>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
