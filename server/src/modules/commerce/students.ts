/** Attributed students lists (ADM-SCH-08, ADM-MKT-11) — AdminStudentRow via the students module read-model. */
import { orderBy, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { studentsService } from '../students/index.js';

const SORT = { name: 'u.name_en', mobile: 'u.phone', createdAt: 'u.created_at', lastActive: 'u.last_active_at', subscriptionStatus: 'sub.sub_status' };

export async function attributedStudents(by: { schoolId?: string; marketerId?: string }, q: { q?: string; page?: number; pageSize?: number; sort?: string }) {
  const p = toPagination(q);
  const r = await studentsService.list({ ...by, q: q.q }, orderBy(q.sort, SORT, '-createdAt'), p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
}
