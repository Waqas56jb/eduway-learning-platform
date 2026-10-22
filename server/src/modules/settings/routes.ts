import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { settingsController as c } from './controller.js';
import {
  acceptancesQuery,
  docParam,
  faqBody,
  flagCreateBody,
  flagPatchBody,
  flagsQuery,
  legalCreateBody,
  legalPatchBody,
  orderBody,
  publishBody,
  sectionParam,
  testimonialBody,
} from './schemas.js';

export const router = Router();
const cfg = ['Admin · Settings'];
const flg = ['Admin · Feature flags'];
const lgl = ['Admin · Legal'];
const cms = ['Admin · CMS'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/admin/settings/:section', tags: cfg, summary: 'Get settings section (ADM-CFG-01)', auth: A, permission: 'settings.view', params: sectionParam }, ({ params }) => c.getSection(params.section));
defineRoute(router, { method: 'put', path: '/admin/settings/:section', tags: cfg, summary: 'Update settings section — merged, audited, effective immediately (ADM-CFG-02)', auth: A, permission: 'settings.edit', params: sectionParam, body: z.record(z.unknown()) }, ({ req, admin, params, body }) => c.putSection(req, admin, params.section, body));

defineRoute(router, { method: 'get', path: '/admin/feature-flags', tags: flg, summary: 'Feature flags (ADM-FLG-01)', auth: A, permission: 'settings.view', query: flagsQuery }, ({ query }) => c.flags(query));
defineRoute(router, { method: 'post', path: '/admin/feature-flags', tags: flg, summary: 'Create flag (ADM-FLG-03)', auth: A, permission: 'settings.edit', body: flagCreateBody, status: 201 }, ({ req, admin, body }) => c.createFlag(req, admin, body));
defineRoute(router, { method: 'patch', path: '/admin/feature-flags/:id', tags: flg, summary: 'Toggle / target flag (ADM-FLG-02)', auth: A, permission: 'settings.edit', params: idParam, body: flagPatchBody }, ({ req, admin, params, body }) => c.patchFlag(req, admin, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/feature-flags/:id', tags: flg, summary: 'Delete flag (ADM-FLG-04)', auth: A, permission: 'settings.delete', params: idParam, response: okDto }, ({ req, params }) => c.deleteFlag(req, params.id));

defineRoute(router, { method: 'get', path: '/admin/legal/:doc/versions', tags: lgl, summary: 'Legal versions (ADM-LGL-01)', auth: A, permission: 'settings.view', params: docParam }, ({ params }) => c.legalVersions(params.doc));
defineRoute(router, { method: 'post', path: '/admin/legal/:doc/versions', tags: lgl, summary: 'New draft version (ADM-LGL-02)', auth: A, permission: 'settings.edit', params: docParam, body: legalCreateBody, status: 201 }, ({ req, admin, params, body }) => c.legalCreate(req, admin, params.doc, body));
defineRoute(router, { method: 'get', path: '/admin/legal/:doc/stats', tags: lgl, summary: 'Acceptance stats (ADM-LGL-06)', auth: A, permission: 'settings.view', params: docParam }, ({ params }) => c.legalStats(params.doc));
defineRoute(router, { method: 'patch', path: '/admin/legal/versions/:id', tags: lgl, summary: 'Edit draft (ADM-LGL-03)', auth: A, permission: 'settings.edit', params: idParam, body: legalPatchBody }, ({ req, params, body }) => c.legalUpdate(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/legal/versions/:id/publish', tags: lgl, summary: 'Publish draft (ADM-LGL-04)', auth: A, permission: 'settings.edit', params: idParam, body: publishBody }, ({ req, params, body }) => c.legalPublish(req, params.id, body.requireReacceptance));
defineRoute(router, { method: 'delete', path: '/admin/legal/versions/:id', tags: lgl, summary: 'Delete draft (ADM-LGL-05)', auth: A, permission: 'settings.edit', params: idParam, response: okDto }, ({ req, params }) => c.legalDelete(req, params.id));
defineRoute(router, { method: 'get', path: '/admin/legal/versions/:id/acceptances', tags: lgl, summary: 'Acceptance list (ADM-LGL-07)', auth: A, permission: 'settings.view', params: idParam, query: acceptancesQuery }, ({ params, query }) => c.legalAcceptances(params.id, query));

defineRoute(router, { method: 'get', path: '/admin/cms/testimonials', tags: cms, summary: 'Testimonials (ADM-CMS-01)', auth: A, permission: 'settings.view' }, () => c.testimonials());
defineRoute(router, { method: 'post', path: '/admin/cms/testimonials', tags: cms, summary: 'Create testimonial (ADM-CMS-02)', auth: A, permission: 'settings.edit', body: testimonialBody, status: 201 }, ({ req, body }) => c.saveTestimonial(req, null, body));
defineRoute(router, { method: 'patch', path: '/admin/cms/testimonials/:id', tags: cms, summary: 'Update testimonial (ADM-CMS-03)', auth: A, permission: 'settings.edit', params: idParam, body: testimonialBody.partial() }, ({ req, params, body }) => c.saveTestimonial(req, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/cms/testimonials/:id', tags: cms, summary: 'Delete testimonial (ADM-CMS-04)', auth: A, permission: 'settings.edit', params: idParam, response: okDto }, ({ req, params }) => c.deleteTestimonial(req, params.id));
defineRoute(router, { method: 'get', path: '/admin/cms/faq', tags: cms, summary: 'FAQ (ADM-CMS-05)', auth: A, permission: 'settings.view' }, () => c.faqs());
defineRoute(router, { method: 'post', path: '/admin/cms/faq', tags: cms, summary: 'Create FAQ item (ADM-CMS-06)', auth: A, permission: 'settings.edit', body: faqBody, status: 201 }, ({ req, body }) => c.saveFaq(req, null, body));
defineRoute(router, { method: 'patch', path: '/admin/cms/faq/:id', tags: cms, summary: 'Update FAQ item (ADM-CMS-07)', auth: A, permission: 'settings.edit', params: idParam, body: faqBody.partial() }, ({ req, params, body }) => c.saveFaq(req, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/cms/faq/:id', tags: cms, summary: 'Delete FAQ item (ADM-CMS-08)', auth: A, permission: 'settings.edit', params: idParam, response: okDto }, ({ req, params }) => c.deleteFaq(req, params.id));
defineRoute(router, { method: 'put', path: '/admin/cms/order', tags: cms, summary: 'Reorder testimonials / FAQ (ADM-CMS-09)', auth: A, permission: 'settings.edit', body: orderBody, response: okDto }, ({ req, body }) => c.reorder(req, body.kind, body.ids));
