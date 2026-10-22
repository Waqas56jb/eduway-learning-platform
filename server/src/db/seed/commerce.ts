/**
 * Commerce seed (Agent C): gateway settlement figures for reconciliation (most days matched, a few mismatches /
 * unreported so the Reconciliation page has every state) + marketer milestone awards for reached milestones.
 * Idempotent (ON CONFLICT DO NOTHING).
 */
import { T } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';

export async function seedCommerce(c: TxClient): Promise<void> {
  const sys = await c.query<{ day: string; gateway: string; cnt: number; amount: number }>(
    `SELECT (paid_at AT TIME ZONE 'Asia/Baghdad')::date::text AS day, provider AS gateway, count(*)::int AS cnt, sum(total)::bigint AS amount
       FROM ${T.payments}
      WHERE status IN ('paid', 'partially_refunded', 'refunded') AND paid_at IS NOT NULL AND provider <> 'mock'
        AND paid_at < date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') - interval '1 day'
      GROUP BY 1, 2 ORDER BY 1 DESC`,
  );
  for (const [i, r] of sys.rows.entries()) {
    if (i % 9 === 4) continue; // leave a few days unreported
    const reported = i % 7 === 2 ? Number(r.amount) - 5000 : Number(r.amount);
    await c.query(
      `INSERT INTO ${T.reconciliation_records} (day, gateway, tx_count, system_amount, reported_amount, state, raw)
       VALUES ($1::date, $2, $3, $4, $5, $6, '{"source":"seed"}'::jsonb) ON CONFLICT (day, gateway) DO NOTHING`,
      [r.day, r.gateway, r.cnt, Number(r.amount), reported, reported === Number(r.amount) ? 'matched' : 'mismatch'],
    );
  }
  await c.query(
    `INSERT INTO ${T.marketer_milestone_awards} (marketer_id, milestone_item_id, paid_students, reward)
     SELECT m.marketer_id, i.id, m.paid, i.reward
       FROM (SELECT marketer_id, count(DISTINCT user_id)::int AS paid FROM ${T.payments}
              WHERE marketer_id IS NOT NULL AND status IN ('paid', 'partially_refunded') GROUP BY 1) m
       JOIN ${T.milestone_items} i ON i.threshold <= m.paid
       JOIN ${T.milestone_sets} s ON s.id = i.set_id AND s.status = 'active'
     ON CONFLICT (marketer_id, milestone_item_id) DO NOTHING`,
  );
}
