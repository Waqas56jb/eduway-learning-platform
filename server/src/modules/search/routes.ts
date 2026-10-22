import { Router } from 'express';
import { UnauthorizedError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { searchQuery } from './schemas.js';
import { searchService } from './service.js';

export const router = Router();

defineRoute(
  router,
  { method: 'get', path: '/search', tags: ['Search'], summary: 'Global search scoped by role (SRC-01) · rl:search', auth: 'any', query: searchQuery, rateLimit: rateLimits.search },
  ({ student, admin, query }) => {
    if (admin) return searchService.admin(admin, query.q, query.scopes, query.limit);
    if (student) return searchService.student(student.userId, query.q, query.scopes, query.limit);
    throw new UnauthorizedError();
  },
);
