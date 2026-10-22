/** Landing-page CMS: testimonials & FAQ (ADM-CMS-*), feeding PUB-06/PUB-07. */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { storage } from '../../common/services/storage.js';

export interface TestimonialDto {
  id: string;
  name: Localized;
  city: Localized;
  role: Localized;
  quote: Localized;
  avatar: string | null;
  rating: number;
  order: number;
  active: boolean;
  placements: string[];
}

export interface FaqDto {
  id: string;
  q: Localized;
  a: Localized;
  order: number;
  active: boolean;
  placements: string[];
}

const L = (r: Record<string, unknown>, f: string): Localized => ({ en: String(r[`${f}_en`] ?? ''), ar: String(r[`${f}_ar`] ?? '') });

export async function testimonialDtos(rows: Record<string, unknown>[]): Promise<TestimonialDto[]> {
  const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url as string | null));
  return rows.map((r, i) => ({
    id: String(r.id),
    name: L(r, 'name'),
    city: L(r, 'city'),
    role: L(r, 'role'),
    quote: L(r, 'quote'),
    avatar: avatars[i] ?? null,
    rating: Number(r.rating),
    order: Number(r.sort_order),
    active: Boolean(r.active),
    placements: r.placements as string[],
  }));
}

export function faqDto(r: Record<string, unknown>): FaqDto {
  return { id: String(r.id), q: L(r, 'question'), a: L(r, 'answer'), order: Number(r.sort_order), active: Boolean(r.active), placements: r.placements as string[] };
}

export interface TestimonialWrite {
  name: Localized;
  city: Localized;
  role: Localized;
  quote: Localized;
  avatarFileKey?: string | null;
  rating: number;
  placements: string[];
  order: number;
  active: boolean;
}

export interface FaqWrite {
  q: Localized;
  a: Localized;
  placements: string[];
  order: number;
  active: boolean;
}

export const cmsService = {
  async testimonials(placement?: string, onlyActive = false) {
    const p: unknown[] = [];
    const w: string[] = [];
    if (onlyActive) w.push('active');
    if (placement) {
      p.push(placement);
      w.push(`$${p.length} = ANY(placements)`);
    }
    const rows = await db.many<Record<string, unknown>>(`SELECT * FROM ${T.cms_testimonials}${w.length ? ` WHERE ${w.join(' AND ')}` : ''} ORDER BY sort_order, created_at`, p);
    return testimonialDtos(rows);
  },
  async testimonial(id: string) {
    const r = await db.maybeOne<Record<string, unknown>>(`SELECT * FROM ${T.cms_testimonials} WHERE id = $1`, [id]);
    if (!r) throw new NotFoundError('testimonial');
    return (await testimonialDtos([r]))[0] as TestimonialDto;
  },
  async saveTestimonial(id: string | null, w: Partial<TestimonialWrite>) {
    const tid = id ?? randomUUID();
    let avatar: string | null | undefined;
    if (w.avatarFileKey === null) avatar = null;
    else if (w.avatarFileKey) {
      const up = await storage.attachUpload(w.avatarFileKey, { purpose: 'testimonial_avatar', entityType: 'testimonial', entityId: tid });
      avatar = storage.ref(up.bucket, up.path);
    }
    if (!id) {
      await db.query(
        `INSERT INTO ${T.cms_testimonials} (id, slug, name_en, name_ar, city_en, city_ar, role_en, role_ar, quote_en, quote_ar, avatar_url, rating, placements, sort_order, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [tid, `t-${tid.slice(0, 8)}`, w.name?.en, w.name?.ar, w.city?.en ?? '', w.city?.ar ?? '', w.role?.en ?? '', w.role?.ar ?? '', w.quote?.en, w.quote?.ar, avatar ?? null, w.rating ?? 5, w.placements ?? ['landing'], w.order ?? 0, w.active ?? true],
      );
    } else {
      await this.testimonial(id);
      await db.query(
        `UPDATE ${T.cms_testimonials} SET name_en = COALESCE($2, name_en), name_ar = COALESCE($3, name_ar), city_en = COALESCE($4, city_en), city_ar = COALESCE($5, city_ar),
           role_en = COALESCE($6, role_en), role_ar = COALESCE($7, role_ar), quote_en = COALESCE($8, quote_en), quote_ar = COALESCE($9, quote_ar),
           avatar_url = CASE WHEN $10::boolean THEN $11 ELSE avatar_url END, rating = COALESCE($12, rating), placements = COALESCE($13, placements),
           sort_order = COALESCE($14, sort_order), active = COALESCE($15, active)
         WHERE id = $1`,
        [id, w.name?.en ?? null, w.name?.ar ?? null, w.city?.en ?? null, w.city?.ar ?? null, w.role?.en ?? null, w.role?.ar ?? null, w.quote?.en ?? null, w.quote?.ar ?? null, avatar !== undefined, avatar ?? null, w.rating ?? null, w.placements ?? null, w.order ?? null, w.active ?? null],
      );
    }
    return this.testimonial(tid);
  },
  async deleteTestimonial(id: string) {
    const before = await this.testimonial(id);
    await db.query(`DELETE FROM ${T.cms_testimonials} WHERE id = $1`, [id]);
    return before;
  },

  async faqs(placement?: string, onlyActive = false) {
    const p: unknown[] = [];
    const w: string[] = [];
    if (onlyActive) w.push('active');
    if (placement) {
      p.push(placement);
      w.push(`$${p.length} = ANY(placements)`);
    }
    const rows = await db.many<Record<string, unknown>>(`SELECT * FROM ${T.cms_faq}${w.length ? ` WHERE ${w.join(' AND ')}` : ''} ORDER BY sort_order, created_at`, p);
    return rows.map(faqDto);
  },
  async faq(id: string) {
    const r = await db.maybeOne<Record<string, unknown>>(`SELECT * FROM ${T.cms_faq} WHERE id = $1`, [id]);
    if (!r) throw new NotFoundError('faq');
    return faqDto(r);
  },
  async saveFaq(id: string | null, w: Partial<FaqWrite>) {
    if (!id) {
      const r = await db.one<{ id: string }>(
        `INSERT INTO ${T.cms_faq} (slug, question_en, question_ar, answer_en, answer_ar, placements, sort_order, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [`faq-${randomUUID().slice(0, 8)}`, w.q?.en, w.q?.ar, w.a?.en, w.a?.ar, w.placements ?? ['landing'], w.order ?? 0, w.active ?? true],
      );
      return this.faq(r.id);
    }
    await this.faq(id);
    await db.query(
      `UPDATE ${T.cms_faq} SET question_en = COALESCE($2, question_en), question_ar = COALESCE($3, question_ar), answer_en = COALESCE($4, answer_en),
         answer_ar = COALESCE($5, answer_ar), placements = COALESCE($6, placements), sort_order = COALESCE($7, sort_order), active = COALESCE($8, active)
       WHERE id = $1`,
      [id, w.q?.en ?? null, w.q?.ar ?? null, w.a?.en ?? null, w.a?.ar ?? null, w.placements ?? null, w.order ?? null, w.active ?? null],
    );
    return this.faq(id);
  },
  async deleteFaq(id: string) {
    const before = await this.faq(id);
    await db.query(`DELETE FROM ${T.cms_faq} WHERE id = $1`, [id]);
    return before;
  },

  async reorder(kind: 'testimonials' | 'faq', ids: string[]) {
    const table = kind === 'faq' ? T.cms_faq : T.cms_testimonials;
    await tx(async (c) => {
      for (const [i, id] of ids.entries()) await db.query(`UPDATE ${table} SET sort_order = $2 WHERE id = $1`, [id, i + 1], c);
    });
  },
};
