import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { packagesController as c } from './controller.js';
import { adminPackageDto, adminPackageListQuery, archiveBody, orderBody, packageExportBody, packageIdParam, packagePatchBody, packagePublicDto, packageWriteBody } from './schemas.js';
import { z } from '../../common/validation/zod.js';

export const router = Router();
const pub = ['Packages'];
const tags = ['Admin · Packages'];
const A = 'admin' as const;

// ── student / public (PAY-01, PAY-02) ──
defineRoute(router, { method: 'get', path: '/packages', tags: pub, summary: 'Active packages (PAY-01 / PUB-13)', auth: 'optional', response: z.array(packagePublicDto) }, ({ student }) => c.listPublic(student?.userId));
defineRoute(router, { method: 'get', path: '/packages/:packageId', tags: pub, summary: 'Package detail (PAY-02)', auth: 'optional', params: packageIdParam, response: packagePublicDto }, ({ params, student }) => c.getPublic(params.packageId, student?.userId));

// ── admin (ADM-PKG-*) — static paths before `/:id` ──
defineRoute(router, { method: 'get', path: '/admin/packages', tags, summary: 'List packages (ADM-PKG-01)', auth: A, permission: 'packages.view', query: adminPackageListQuery, response: z.array(adminPackageDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'put', path: '/admin/packages/order', tags, summary: 'Reorder packages (ADM-PKG-09)', auth: A, permission: 'packages.edit', body: orderBody }, ({ req, body }) => c.reorder(req, body.ids));
defineRoute(router, { method: 'post', path: '/admin/packages/export', tags, summary: 'Export packages (ADM-PKG-10)', auth: A, permission: 'packages.export', body: packageExportBody, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/packages', tags, summary: 'Create package (ADM-PKG-03)', auth: A, permission: 'packages.create', body: packageWriteBody, status: 201, response: adminPackageDto }, ({ req, body }) => c.create(req, body));
defineRoute(router, { method: 'get', path: '/admin/packages/:id', tags, summary: 'Package (ADM-PKG-02)', auth: A, permission: 'packages.view', params: idParam, response: adminPackageDto }, ({ params }) => c.get(params.id));
defineRoute(router, { method: 'patch', path: '/admin/packages/:id', tags, summary: 'Update package (ADM-PKG-04)', auth: A, permission: 'packages.edit', params: idParam, body: packagePatchBody, response: adminPackageDto }, ({ req, params, body }) => c.update(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/packages/:id/duplicate', tags, summary: 'Duplicate package (ADM-PKG-05)', auth: A, permission: 'packages.create', params: idParam, status: 201, response: adminPackageDto }, ({ req, params }) => c.duplicate(req, params.id));
defineRoute(router, { method: 'post', path: '/admin/packages/:id/archive', tags, summary: 'Archive package (ADM-PKG-06)', auth: A, permission: 'packages.edit', params: idParam, body: archiveBody, response: adminPackageDto }, ({ req, params, body }) => c.archive(req, params.id, body.reason));
defineRoute(router, { method: 'post', path: '/admin/packages/:id/restore', tags, summary: 'Restore package (ADM-PKG-07)', auth: A, permission: 'packages.edit', params: idParam, response: adminPackageDto }, ({ req, params }) => c.restore(req, params.id));
defineRoute(router, { method: 'delete', path: '/admin/packages/:id', tags, summary: 'Delete package (ADM-PKG-08)', auth: A, permission: 'packages.delete', params: idParam, response: okDto }, ({ req, params }) => c.remove(req, params.id));
