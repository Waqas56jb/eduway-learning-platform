import type { Request } from 'express';
import { OK } from '../../common/dto/refs.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { validationErrorFrom, zodIssues } from '../../common/middleware/validate.js';
import { cmsService, type FaqWrite, type TestimonialWrite } from './cms.js';
import { legalService, type LegalDoc } from './legal.js';
import { SECTION_BODIES } from './schemas.js';
import { diffKeys, flagsService, getSection, putSection, type SettingsSection } from './service.js';

export const settingsController = {
  getSection: (section: SettingsSection) => getSection(section),

  async putSection(req: Request, admin: AdminPrincipal, section: SettingsSection, body: unknown) {
    const parsed = SECTION_BODIES[section].safeParse(body ?? {});
    if (!parsed.success) throw validationErrorFrom(zodIssues(parsed.error));
    const { before, after } = await putSection(section, parsed.data as Record<string, unknown>, admin.userId);
    const d = diffKeys(before as Record<string, unknown>, after as Record<string, unknown>);
    if (d.changed) req.audit = { action: 'settings.update', entity: 'settings', entityId: section, summary: `Updated ${section} settings (${Object.keys(d.after).join(', ')})`, before: d.before, after: d.after };
    else req.auditWritten = true; // no-op
    return after;
  },

  async flags(q: { environment?: string; q?: string }) {
    const r = await flagsService.list(q);
    return paged(r.items, { page: 1, pageSize: r.items.length, total: r.items.length, nextCursor: null, counts: r.counts });
  },
  async patchFlag(req: Request, admin: AdminPrincipal, id: string, body: { enabled?: boolean; platforms?: string[]; rolloutPct?: number }) {
    const { before, after } = await flagsService.update(id, body, admin.userId);
    const verb = before.enabled !== after.enabled ? (after.enabled ? 'Enabled' : 'Disabled') : 'Updated';
    req.audit = { action: 'feature_flag.toggle', entity: 'feature_flag', entityId: id, summary: `${verb} ${after.name.en} in ${after.environment}`, before: { enabled: before.enabled, platforms: before.platforms, rolloutPct: before.rolloutPct }, after: { enabled: after.enabled, platforms: after.platforms, rolloutPct: after.rolloutPct } };
    return after;
  },
  async createFlag(req: Request, admin: AdminPrincipal, body: Parameters<typeof flagsService.create>[0]) {
    const f = await flagsService.create(body, admin.userId);
    req.audit = { action: 'feature_flag.create', entity: 'feature_flag', entityId: f.id, summary: `Created flag ${f.key}`, before: null, after: { key: f.key, enabled: f.enabled } };
    return f;
  },
  async deleteFlag(req: Request, id: string) {
    const f = await flagsService.remove(id);
    req.audit = { action: 'feature_flag.delete', entity: 'feature_flag', entityId: id, summary: `Deleted flag ${f.key}`, before: { key: f.key, enabled: f.enabled }, after: null };
    return OK;
  },

  legalVersions: (doc: LegalDoc) => legalService.versions(doc),
  async legalCreate(req: Request, admin: AdminPrincipal, doc: LegalDoc, body: { version?: string; cloneFromId?: string }) {
    const v = await legalService.createDraft(doc, body, admin.userId);
    req.audit = { action: 'legal_document.create', entity: 'legal_document', entityId: v.id, summary: `Created ${doc} draft v${v.version}`, before: null, after: { doc, version: v.version } };
    return v;
  },
  async legalUpdate(req: Request, id: string, body: Parameters<typeof legalService.update>[1]) {
    const { before, after } = await legalService.update(id, body);
    req.audit = { action: 'legal_document.update', entity: 'legal_document', entityId: id, summary: `Edited ${after.doc} draft v${after.version}`, before: { version: before.version, title: before.title }, after: { version: after.version, title: after.title } };
    return after;
  },
  async legalPublish(req: Request, id: string, requireReacceptance: boolean) {
    const r = await legalService.publish(id, requireReacceptance);
    req.audit = { action: 'legal_document.publish', entity: 'legal_document', entityId: id, summary: `Published ${r.published.doc} v${r.published.version}${r.retired ? ` (retired v${r.retired.version})` : ''}`, before: r.retired ? { retired: r.retired.version } : null, after: { published: r.published.version, requireReacceptance } };
    return r;
  },
  async legalDelete(req: Request, id: string) {
    const d = await legalService.removeDraft(id);
    req.audit = { action: 'legal_document.delete', entity: 'legal_document', entityId: id, summary: `Deleted ${d.doc} draft v${d.version}`, before: { version: d.version }, after: null };
    return OK;
  },
  legalStats: (doc: LegalDoc) => legalService.stats(doc),
  async legalAcceptances(id: string, q: { q?: string; page: number; pageSize: number }) {
    const p = toPagination(q);
    const r = await legalService.acceptances(id, q.q, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },

  testimonials: () => cmsService.testimonials(),
  async saveTestimonial(req: Request, id: string | null, body: Partial<TestimonialWrite>) {
    const t = await cmsService.saveTestimonial(id, body);
    req.audit = { action: id ? 'cms_testimonial.update' : 'cms_testimonial.create', entity: 'cms_testimonial', entityId: t.id, summary: `${id ? 'Updated' : 'Created'} testimonial ${t.name.en}`, after: { name: t.name, active: t.active } };
    return t;
  },
  async deleteTestimonial(req: Request, id: string) {
    const t = await cmsService.deleteTestimonial(id);
    req.audit = { action: 'cms_testimonial.delete', entity: 'cms_testimonial', entityId: id, summary: `Deleted testimonial ${t.name.en}`, before: { name: t.name }, after: null };
    return OK;
  },
  faqs: () => cmsService.faqs(),
  async saveFaq(req: Request, id: string | null, body: Partial<FaqWrite>) {
    const f = await cmsService.saveFaq(id, body);
    req.audit = { action: id ? 'cms_faq.update' : 'cms_faq.create', entity: 'cms_faq', entityId: f.id, summary: `${id ? 'Updated' : 'Created'} FAQ item`, after: { q: f.q, active: f.active } };
    return f;
  },
  async deleteFaq(req: Request, id: string) {
    const f = await cmsService.deleteFaq(id);
    req.audit = { action: 'cms_faq.delete', entity: 'cms_faq', entityId: id, summary: 'Deleted FAQ item', before: { q: f.q }, after: null };
    return OK;
  },
  async reorder(req: Request, kind: 'testimonials' | 'faq', ids: string[]) {
    await cmsService.reorder(kind, ids);
    req.audit = { action: `cms_${kind === 'faq' ? 'faq' : 'testimonial'}.reorder`, entity: `cms_${kind}`, entityId: null, summary: `Reordered ${kind}`, after: { ids } };
    return OK;
  },
};
