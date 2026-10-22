import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { createRateLimit, rateLimits } from '../../common/middleware/rateLimit.js';
import { publicController as c } from './controller.js';
import { appConfigQuery, codeParam, contactBody, faqQuery, legalDocParam, legalVersionQuery, schoolsQuery, testimonialsQuery } from './schemas.js';

export const router = Router();
const tags = ['Public'];
const contactLimit = createRateLimit({ name: 'contact', windowMs: 60 * 60_000, limit: 5 });

defineRoute(router, { method: 'get', path: '/public/app-config', tags, summary: 'Client configuration: maintenance, versions, flags, learning (PUB-01)', auth: 'public', query: appConfigQuery }, ({ req, query }) => c.appConfig(req, query.platform));
defineRoute(router, { method: 'get', path: '/public/governorates', tags, summary: 'Governorates (PUB-02)', auth: 'public' }, ({ req, res }) => c.governorates(req, res));
defineRoute(router, { method: 'get', path: '/public/schools', tags, summary: 'School directory (PUB-03)', auth: 'public', query: schoolsQuery }, ({ res, query }) => c.schools(res, query));
defineRoute(router, { method: 'get', path: '/public/referral-codes/:code', tags, summary: 'Validate referral / school code (PUB-04)', auth: 'public', rateLimit: rateLimits.auth, params: codeParam }, ({ params }) => c.referralCode(params.code));
defineRoute(router, { method: 'get', path: '/public/stats', tags, summary: 'Marketing stats (PUB-05)', auth: 'public' }, ({ res }) => c.stats(res));
defineRoute(router, { method: 'get', path: '/public/testimonials', tags, summary: 'Testimonials (PUB-06)', auth: 'public', query: testimonialsQuery }, ({ res, query }) => c.testimonials(res, query.placement));
defineRoute(router, { method: 'get', path: '/public/faq', tags, summary: 'FAQ (PUB-07)', auth: 'public', query: faqQuery }, ({ res, query }) => c.faq(res, query.placement));
defineRoute(router, { method: 'get', path: '/public/teachers', tags, summary: 'Teachers (PUB-08)', auth: 'public' }, ({ res }) => c.teachers(res));
defineRoute(router, { method: 'get', path: '/public/payment-methods', tags, summary: 'Payment methods (PUB-09)', auth: 'public' }, ({ res }) => c.paymentMethods(res));
defineRoute(router, { method: 'post', path: '/public/contact', tags, summary: 'Contact form → support ticket (PUB-10)', auth: 'public', rateLimit: contactLimit, body: contactBody, status: 201 }, ({ body }) => c.contact(body));
defineRoute(router, { method: 'get', path: '/legal/:doc', tags, summary: 'Published legal document (PUB-11)', auth: 'public', params: legalDocParam, query: legalVersionQuery }, ({ res, params, query }) => c.legal(res, params.doc, query.version));
