import type { Request, Response } from 'express';
import type { StudentPlatform } from '../../config/constants.js';
import { legalService, type LegalDoc } from '../settings/legal.js';
import { publicService } from './service.js';

/** Public responses are cacheable for 60 s (contract §3). */
const cacheable = (res: Response) => res.setHeader('Cache-Control', 'public, max-age=60');

export const publicController = {
  appConfig(req: Request, platform?: StudentPlatform) {
    const plat = platform ?? (req.clientPlatform && req.clientPlatform !== 'admin' ? req.clientPlatform : null);
    return publicService.appConfig(plat, req.get('x-app-version'));
  },
  governorates: (req: Request, res: Response) => (cacheable(res), publicService.governorates(req.locale)),
  schools: (res: Response, q: { governorateId?: string; q?: string; limit: number }) => (cacheable(res), publicService.schools(q)),
  referralCode: (code: string) => publicService.referralCode(code),
  stats: (res: Response) => (cacheable(res), publicService.stats()),
  testimonials: (res: Response, placement?: string) => (cacheable(res), publicService.testimonials(placement)),
  faq: (res: Response, placement?: string) => (cacheable(res), publicService.faq(placement)),
  teachers: (res: Response) => (cacheable(res), publicService.teachers()),
  paymentMethods: (res: Response) => (cacheable(res), publicService.paymentMethods()),
  contact: (body: Parameters<typeof publicService.contact>[0]) => publicService.contact(body),
  legal: (res: Response, doc: LegalDoc, version?: string) => (cacheable(res), legalService.publicDocument(doc, version)),
};
