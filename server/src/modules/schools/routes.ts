import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { schoolsController as c } from './controller.js';
import { bulkStatusBody, exportRequest, noteBody, progressQuery, schoolCreateBody, schoolDto, schoolListQuery, schoolPatchBody, setMarketerBody, studentsQuery } from './schemas.js';

export const router = Router();
const tags = ['Admin · Schools'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/admin/schools', tags, summary: 'List partner schools (ADM-SCH-01) — sort name|code|verifiedPaidStudents|pendingSettlement|contractEnd|status|createdAt', auth: A, permission: 'schools.view', query: schoolListQuery, response: z.array(schoolDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'get', path: '/admin/schools/stats', tags, summary: 'School KPIs (ADM-SCH-02)', auth: A, permission: 'schools.view' }, () => c.stats());
defineRoute(router, { method: 'post', path: '/admin/schools/bulk/status', tags, summary: 'Bulk activate/suspend (ADM-SCH-07)', auth: A, permission: 'schools.edit', body: bulkStatusBody }, ({ req, body }) => c.bulkStatus(req, body.ids, body.status, body.reason));
defineRoute(router, { method: 'post', path: '/admin/schools/export', tags, summary: 'Export schools (ADM-SCH-13)', auth: A, permission: 'schools.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/schools', tags, summary: 'Create school (ADM-SCH-04)', auth: A, permission: 'schools.create', body: schoolCreateBody, status: 201, response: schoolDto }, ({ req, admin, body }) => c.create(req, admin, body));
defineRoute(router, { method: 'get', path: '/admin/schools/:id', tags, summary: 'School (ADM-SCH-03)', auth: A, permission: 'schools.view', params: idParam, response: schoolDto }, ({ params }) => c.get(params.id));
defineRoute(router, { method: 'patch', path: '/admin/schools/:id', tags, summary: 'Update school (ADM-SCH-05) — marketerId not writable here', auth: A, permission: 'schools.edit', params: idParam, body: schoolPatchBody, response: schoolDto }, ({ req, params, body }) => c.update(req, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/schools/:id', tags, summary: 'Delete school (ADM-SCH-06)', auth: A, permission: 'schools.delete', params: idParam, response: okDto }, ({ req, params }) => c.remove(req, params.id));
defineRoute(router, { method: 'get', path: '/admin/schools/:id/students', tags, summary: 'Attributed students (ADM-SCH-08) — sort name|createdAt|lastActive (default -createdAt)', auth: A, permission: 'schools.view', params: idParam, query: studentsQuery }, ({ params, query }) => c.students(params.id, query));
defineRoute(
  router,
  { method: 'put', path: '/admin/schools/:id/marketer', tags, summary: 'Assign/unassign marketer with double-attribution guard (ADM-SCH-09)', auth: A, anyPermission: ['schools.edit', 'marketers.edit'], params: idParam, body: setMarketerBody, response: schoolDto },
  ({ req, admin, params, body }) => c.setMarketer(req, admin, params.id, body),
);
defineRoute(router, { method: 'get', path: '/admin/schools/:id/incentive-progress', tags, summary: 'Incentive progress (ADM-SCH-10)', auth: A, permission: 'schools.view', params: idParam, query: progressQuery }, ({ params, query }) => c.progress(params.id, query.period));
defineRoute(router, { method: 'get', path: '/admin/schools/:id/notes', tags, summary: 'Notes (ADM-SCH-11)', auth: A, permission: 'schools.view', params: idParam }, ({ params }) => c.notes(params.id));
defineRoute(router, { method: 'post', path: '/admin/schools/:id/notes', tags, summary: 'Add note (ADM-SCH-12)', auth: A, permission: 'schools.edit', params: idParam, body: noteBody, status: 201 }, ({ req, admin, params, body }) => c.addNote(req, admin, params.id, body.body));
