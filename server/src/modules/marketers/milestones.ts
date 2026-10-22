/**
 * Marketer milestone awards: when a marketer's verified paid students reach an item threshold of the ACTIVE
 * milestone set, an award row is queued (unique marketer × item). Awards are paid out via marketer settlements.
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';

export async function paidStudentsOf(marketerId: string, ex?: Executor): Promise<number> {
  return (
    (await db.scalar<number>(
      `SELECT count(DISTINCT user_id)::int FROM ${T.payments} WHERE marketer_id = $1 AND status IN ('paid', 'partially_refunded') AND paid_at IS NOT NULL`,
      [marketerId],
      ex,
    )) ?? 0
  );
}

/** Insert awards for newly reached milestones of the active set. Returns the number of new awards. */
export async function awardMilestones(marketerId: string, ex?: Executor): Promise<number> {
  const paid = await paidStudentsOf(marketerId, ex);
  return db.exec(
    `INSERT INTO ${T.marketer_milestone_awards} (marketer_id, milestone_item_id, paid_students, reward)
     SELECT $1, i.id, $2, i.reward
       FROM ${T.milestone_items} i JOIN ${T.milestone_sets} s ON s.id = i.set_id
      WHERE s.status = 'active' AND i.threshold <= $2
     ON CONFLICT (marketer_id, milestone_item_id) DO NOTHING`,
    [marketerId, paid],
    ex,
  );
}

/** Re-evaluate every active marketer (after a milestone set is activated). */
export async function awardAllMilestones(ex?: Executor): Promise<number> {
  const ids = await db.many<{ id: string }>(`SELECT id FROM ${T.marketers} WHERE deleted_at IS NULL`, [], ex);
  let n = 0;
  for (const m of ids) n += await awardMilestones(m.id, ex);
  return n;
}
