import type { Request } from 'express';
import { paged } from '../../common/utils/response.js';
import { OK } from '../../common/dto/refs.js';
import { rolesService, type RoleWrite } from './service.js';
import type { PermissionMatrix } from './types.js';

export const rolesController = {
  async list() {
    const { items, meta } = await rolesService.list();
    return paged(items, { page: 1, pageSize: items.length, total: items.length, nextCursor: null, ...meta });
  },
  get: (id: string) => rolesService.get(id),
  async create(req: Request, body: RoleWrite) {
    const role = await rolesService.create(body);
    req.audit = { action: 'role.create', entity: 'role', entityId: role.id, summary: `Created role ${role.name.en}`, before: null, after: { key: role.key, grantedCount: role.grantedCount } };
    return role;
  },
  async update(req: Request, id: string, body: RoleWrite) {
    const before = await rolesService.get(id);
    const role = await rolesService.update(id, body);
    const d = rolesService.diff(before.permissions as PermissionMatrix, role.permissions);
    req.audit = { action: 'role.update', entity: 'role', entityId: id, summary: `Updated role ${role.name.en}`, before: { name: before.name, ...d.before }, after: { name: role.name, ...d.after } };
    return role;
  },
  async clone(req: Request, id: string) {
    const role = await rolesService.clone(id);
    req.audit = { action: 'role.clone', entity: 'role', entityId: role.id, summary: `Cloned role into ${role.key}`, before: null, after: { key: role.key } };
    return role;
  },
  async remove(req: Request, id: string, confirmKey: string) {
    const before = await rolesService.get(id);
    await rolesService.remove(id, confirmKey);
    req.audit = { action: 'role.delete', entity: 'role', entityId: id, summary: `Deleted role ${before.key}`, before: { key: before.key, name: before.name }, after: null };
    return OK;
  },
  catalog: () => rolesService.catalog(),
};
