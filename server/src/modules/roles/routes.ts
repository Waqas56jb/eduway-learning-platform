import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { idParam } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { rolesController as c } from './controller.js';
import { permissionCatalogDto, roleDeleteBody, roleDto, roleWriteBody } from './schemas.js';

export const router = Router();
const tags = ['Admin · Roles'];

defineRoute(router, { method: 'get', path: '/admin/roles', tags, summary: 'List roles with permission matrix (ADM-ROL-01)', auth: 'admin', permission: 'security.view', response: z.array(roleDto) }, () => c.list());
defineRoute(router, { method: 'get', path: '/admin/permissions/catalog', tags, summary: 'Permission catalog (ADM-ROL-07)', auth: 'admin', permission: 'security.view', response: permissionCatalogDto }, () => c.catalog());
defineRoute(router, { method: 'get', path: '/admin/roles/:id', tags, summary: 'Get role (ADM-ROL-02)', auth: 'admin', permission: 'security.view', params: idParam, response: roleDto }, ({ params }) => c.get(params.id));
defineRoute(router, { method: 'post', path: '/admin/roles', tags, summary: 'Create role (ADM-ROL-03)', auth: 'admin', permission: 'security.create', body: roleWriteBody, response: roleDto, status: 201 }, ({ req, body }) => c.create(req, body));
defineRoute(router, { method: 'put', path: '/admin/roles/:id', tags, summary: 'Update role + permissions (ADM-ROL-04)', auth: 'admin', permission: 'security.edit', params: idParam, body: roleWriteBody, response: roleDto }, ({ req, params, body }) => c.update(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/roles/:id/clone', tags, summary: 'Clone role (ADM-ROL-05)', auth: 'admin', permission: 'security.create', params: idParam, response: roleDto, status: 201 }, ({ req, params }) => c.clone(req, params.id));
defineRoute(router, { method: 'delete', path: '/admin/roles/:id', tags, summary: 'Delete custom role (ADM-ROL-06)', auth: 'admin', permission: 'security.delete', params: idParam, body: roleDeleteBody }, ({ req, params, body }) => c.remove(req, params.id, body.confirmKey ?? (typeof req.query.confirmKey === 'string' ? req.query.confirmKey : '')));
