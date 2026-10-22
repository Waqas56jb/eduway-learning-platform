/**
 * Reconciliation (ADM-REC-*): system totals per business day × gateway vs gateway-reported settlement amounts.
 * Gateway fee rates come from settings.payments.gateways[].feeRatePct (admin-editable, never constants).
 */
import ExcelJS from 'exceljs';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { supabaseService } from '../../config/supabase.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import { adminInbox } from '../../common/services/admin-inbox.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { iso, isoOrNull, L, pageOf, parseSort, sortRows, type Row } from '../commerce/lib.js';

export interface ReconciliationRow {
  id: string;
  day: string;
  gateway: string;
  count: number;
  systemAmount: number;
  reportedAmount: number | null;
  difference: number;
  state: 'matched' | 'mismatch' | 'reconciled' | 'unreported';
  resolvedBy: { id: string; name: { en: string; ar: string }; avatarUrl: string | null } | null;
  resolvedAt: string | null;
  note: string | null;
}

export interface RecRange {
  from?: string;
  to?: string;
  gateway?: string;
}

/** Date-only inputs (`YYYY-MM-DD`) are already business days — never shift them through the host timezone. */
const businessDayOf = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dayjs.tz(v, BUSINESS_TZ) : dayjs(v).tz(BUSINESS_TZ));

function range(r: RecRange): { from: string; to: string } {
  const to = r.to ? businessDayOf(r.to) : dayjs().tz(BUSINESS_TZ);
  const from = r.from ? businessDayOf(r.from) : to.subtract(89, 'day');
  return { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') };
}

async function feeRates(): Promise<Map<string, number>> {
  const s = await settingsStore.get('payments');
  return new Map(s.gateways.map((g) => [g.id, g.feeRatePct]));
}

/** System aggregates per day × gateway (captured payments by paid_at, business TZ). */
async function systemRows(r: { from: string; to: string }, gateway?: string) {
  return db.many<{ day: string; gateway: string; cnt: number; amount: number; amounts: number[] }>(
    `SELECT (pay.paid_at AT TIME ZONE $3)::date::text AS day, pay.provider AS gateway, count(*)::int AS cnt, sum(pay.total)::bigint AS amount,
            array_agg(pay.total) AS amounts
       FROM ${T.payments} pay
      WHERE pay.status IN ('paid', 'partially_refunded', 'refunded') AND pay.paid_at IS NOT NULL
        AND (pay.paid_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
        AND ($4::text IS NULL OR pay.provider = $4)
      GROUP BY 1, 2`,
    [r.from, r.to, BUSINESS_TZ, gateway ?? null],
  );
}

function stateOf(system: number, reported: number | null, persisted: string | null): ReconciliationRow['state'] {
  if (persisted === 'reconciled') return 'reconciled';
  if (reported === null) return 'unreported';
  return reported === system ? 'matched' : 'mismatch';
}

export const reconciliation = {
  async summary(q: RecRange) {
    const r = range(q);
    const [sys, rates] = await Promise.all([systemRows(r, q.gateway), feeRates()]);
    const refunds = await db.many<{ day: string; amount: number }>(
      `SELECT (rf.decided_at AT TIME ZONE $3)::date::text AS day, sum(rf.amount)::bigint AS amount
         FROM ${T.refunds} rf JOIN ${T.payments} pay ON pay.id = rf.payment_id
        WHERE rf.status IN ('approved', 'processed') AND (rf.decided_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
          AND ($4::text IS NULL OR pay.provider = $4)
        GROUP BY 1`,
      [r.from, r.to, BUSINESS_TZ, q.gateway ?? null],
    );
    const days = new Map<string, { count: number; gross: number; refunds: number; fees: number }>();
    const get = (d: string) => days.get(d) ?? (days.set(d, { count: 0, gross: 0, refunds: 0, fees: 0 }).get(d) as { count: number; gross: number; refunds: number; fees: number });
    for (const s of sys) {
      const d = get(s.day);
      const rate = rates.get(s.gateway) ?? 0;
      d.count += s.cnt;
      d.gross += Number(s.amount);
      d.fees += (s.amounts ?? []).reduce((a, amt) => a + Math.round((Number(amt) * rate) / 100), 0);
    }
    for (const rf of refunds) get(rf.day).refunds += Number(rf.amount);
    const chart: { date: string; gross: number; refunds: number }[] = [];
    for (let d = dayjs(r.from); !d.isAfter(dayjs(r.to)); d = d.add(1, 'day')) {
      const key = d.format('YYYY-MM-DD');
      const v = days.get(key);
      chart.push({ date: key, gross: v?.gross ?? 0, refunds: v?.refunds ?? 0 });
    }
    const daily = [...days.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, v]) => ({ day, count: v.count, gross: v.gross, refunds: v.refunds, fees: v.fees, net: v.gross - v.refunds - v.fees }));
    const comparison = await this.comparisonRows({ ...q, ...r });
    const sum = (k: 'gross' | 'refunds' | 'fees' | 'count') => daily.reduce((a, d) => a + d[k], 0);
    return {
      summary: { gross: sum('gross'), refunds: sum('refunds'), fees: sum('fees'), net: sum('gross') - sum('refunds') - sum('fees'), txnCount: sum('count'), mismatches: comparison.filter((c) => c.state === 'mismatch').length },
      chart,
      daily,
    };
  },

  async comparisonRows(q: RecRange & { onlyMismatches?: boolean; q?: string; sort?: string }): Promise<ReconciliationRow[]> {
    const r = range(q);
    const sys = await systemRows(r, q.gateway);
    const recs = await db.many<Row>(
      `SELECT rr.*, rr.day::text AS day_s, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.avatar_url AS u_avatar_url
         FROM ${T.reconciliation_records} rr LEFT JOIN ${T.users} u ON u.id = rr.resolved_by
        WHERE rr.day BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR rr.gateway = $3)`,
      [r.from, r.to, q.gateway ?? null],
    );
    const keyOf = (d: string, g: string) => `${d}|${g}`;
    const recMap = new Map(recs.map((x) => [keyOf(String(x.day_s), String(x.gateway)), x]));
    const keys = new Set([...sys.map((s) => keyOf(s.day, s.gateway)), ...recs.map((x) => keyOf(String(x.day_s), String(x.gateway)))]);
    const settings = await settingsStore.get('payments');
    let rows: ReconciliationRow[] = [...keys].map((k) => {
      const [day, gateway] = k.split('|') as [string, string];
      const s = sys.find((x) => x.day === day && x.gateway === gateway);
      const rec = recMap.get(k);
      const systemAmount = Number(s?.amount ?? 0);
      const reported = rec?.reported_amount === null || rec?.reported_amount === undefined ? null : Number(rec.reported_amount);
      return {
        id: rec ? String(rec.id) : `${day}:${gateway}`,
        day,
        gateway,
        count: s?.cnt ?? Number(rec?.tx_count ?? 0),
        systemAmount,
        reportedAmount: reported,
        difference: reported === null ? 0 : reported - systemAmount,
        state: stateOf(systemAmount, reported, (rec?.state as string | undefined) ?? null),
        resolvedBy: rec?.u_id ? { id: String(rec.u_id), name: L(rec, 'u_name'), avatarUrl: (rec.u_avatar_url as string | null) ?? null } : null,
        resolvedAt: isoOrNull(rec?.resolved_at),
        note: (rec?.note as string | null | undefined) ?? null,
      };
    });
    if (q.onlyMismatches) rows = rows.filter((x) => x.state === 'mismatch');
    if (q.q) {
      const t = q.q.toLowerCase();
      rows = rows.filter((x) => `${x.gateway} ${settings.gateways.find((g) => g.id === x.gateway)?.name.en ?? ''} ${x.day} ${x.state}`.toLowerCase().includes(t));
    }
    const sort = parseSort(q.sort, ['day', 'gateway', 'systemAmount', 'reportedAmount', 'difference', 'count', 'state'], '-day');
    return sortRows(rows, sort, (x, k) => (k === 'difference' ? Math.abs(x.difference) : (x as unknown as Record<string, unknown>)[k]));
  },

  async comparison(q: RecRange & { onlyMismatches?: boolean; q?: string; sort?: string; page: number; pageSize: number }) {
    return pageOf(await this.comparisonRows(q), q.page, q.pageSize);
  },

  async resolve(body: { day: string; gateway: string; reason: string }, admin: AdminPrincipal): Promise<ReconciliationRow> {
    const sys = (await systemRows({ from: body.day, to: body.day }, body.gateway))[0];
    await db.query(
      `INSERT INTO ${T.reconciliation_records} (day, gateway, tx_count, system_amount, state, resolved_by, resolved_at, note)
       VALUES ($1::date, $2, $3, $4, 'reconciled', $5, now(), $6)
       ON CONFLICT (day, gateway) DO UPDATE SET state = 'reconciled', resolved_by = EXCLUDED.resolved_by, resolved_at = now(), note = EXCLUDED.note,
         tx_count = EXCLUDED.tx_count, system_amount = EXCLUDED.system_amount`,
      [body.day, body.gateway, sys?.cnt ?? 0, Number(sys?.amount ?? 0), admin.userId, body.reason],
    );
    const rows = await this.comparisonRows({ from: body.day, to: body.day, gateway: body.gateway });
    return rows[0] as ReconciliationRow;
  },

  /** ADM-REC-04 — CSV/XLSX with columns day, amount[, count]. */
  async import(body: { gateway: string; fileKey: string }, admin: AdminPrincipal) {
    const up = await storage.attachUpload(body.fileKey, { purpose: 'reconciliation_import', entityType: 'reconciliation', entityId: admin.userId });
    const { data, error } = await supabaseService.storage.from(up.bucket).download(up.path);
    if (error || !data) throw new BusinessRuleError('IMPORT_FILE_INVALID');
    const buf = Buffer.from(await data.arrayBuffer());
    const rows = await parseSettlementFile(buf, up.file_name);
    if (!rows.length) throw new BusinessRuleError('IMPORT_FILE_INVALID');
    let matched = 0;
    let mismatches = 0;
    await tx(async (c) => {
      for (const r of rows) {
        const sys = (await systemRows({ from: r.day, to: r.day }, body.gateway))[0];
        const systemAmount = Number(sys?.amount ?? 0);
        const state = r.amount === systemAmount ? 'matched' : 'mismatch';
        if (state === 'matched') matched++;
        else mismatches++;
        await db.query(
          `INSERT INTO ${T.reconciliation_records} (day, gateway, tx_count, system_amount, reported_amount, state, import_file_key, raw)
           VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (day, gateway) DO UPDATE SET reported_amount = EXCLUDED.reported_amount, system_amount = EXCLUDED.system_amount, tx_count = EXCLUDED.tx_count,
             import_file_key = EXCLUDED.import_file_key, raw = EXCLUDED.raw,
             state = CASE WHEN ${T.reconciliation_records}.state = 'reconciled' THEN 'reconciled' ELSE EXCLUDED.state END`,
          [r.day, body.gateway, sys?.cnt ?? r.count ?? 0, systemAmount, r.amount, state, body.fileKey, JSON.stringify(r)],
          c,
        );
      }
    });
    if (mismatches > 0) {
      await adminInbox.notify({
        permission: 'payments.approve',
        kind: 'warning',
        category: 'reconciliation',
        title: { en: `Reconciliation: ${mismatches} mismatched day(s) for ${body.gateway}`, ar: `التسوية: ${mismatches} يوم غير مطابق لبوابة ${body.gateway}` },
        body: {
          en: `The imported settlement file for ${body.gateway} has ${mismatches} of ${rows.length} day(s) whose reported amount differs from EDUWAY's records. Review and resolve them.`,
          ar: `ملف التسوية المستورد لبوابة ${body.gateway} يحتوي على ${mismatches} من أصل ${rows.length} يوم لا يطابق مبلغها سجلات EDUWAY. يرجى المراجعة والمعالجة.`,
        },
        href: `/payments/reconciliation?gateway=${encodeURIComponent(body.gateway)}`,
        dedupeKey: `reconciliation:${body.gateway}:${body.fileKey}`,
      });
    }
    return { days: rows.length, matched, mismatches };
  },
};

export async function parseSettlementFile(buf: Buffer, fileName: string): Promise<{ day: string; amount: number; count: number | null }[]> {
  let table: string[][] = [];
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    ws?.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')));
      table.push(vals);
    });
  } else {
    table = buf
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
  }
  if (!table.length) return [];
  const header = (table[0] ?? []).map((h) => h.toLowerCase());
  const hasHeader = header.includes('day') || header.includes('date') || header.includes('amount');
  const di = hasHeader ? Math.max(header.indexOf('day'), header.indexOf('date')) : 0;
  const ai = hasHeader ? header.indexOf('amount') : 1;
  const ci = hasHeader ? header.indexOf('count') : 2;
  const out: { day: string; amount: number; count: number | null }[] = [];
  for (const row of hasHeader ? table.slice(1) : table) {
    const day = String(row[di < 0 ? 0 : di] ?? '').slice(0, 10);
    const amount = Number(String(row[ai < 0 ? 1 : ai] ?? '').replace(/[^\d.-]/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(amount)) continue;
    const cnt = ci >= 0 && row[ci] !== undefined && row[ci] !== '' ? Number(row[ci]) : null;
    out.push({ day, amount: Math.round(amount), count: Number.isFinite(cnt as number) ? cnt : null });
  }
  return out;
}

export { iso };
