/* Admin questions, review queue, similarity, tags and bulk import (contract §22). */
import type { Difficulty, Question, QuestionStatus, QuestionType } from '@/types';
import { api, idempotency, type Query } from './client';
import type { AdminRef, BulkResult, FileKey, ID, ISODate, Localized, OkDto, PageMeta, SubjectRef, TopicRef, UnitRef } from './types';

export interface AdminQuestionOption {
  id: ID;
  text: Localized;
  correct: boolean;
}
export interface AdminQuestionDto {
  id: ID;
  code: string;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  subject: SubjectRef;
  unit: UnitRef;
  topic: TopicRef;
  type: QuestionType;
  difficulty: Difficulty;
  body: Localized;
  formula: string | null;
  imageUrl: string | null;
  options: AdminQuestionOption[];
  explanation: Localized;
  tags: string[];
  source: string;
  year: number | null;
  status: QuestionStatus;
  author: AdminRef | null;
  reviewer: AdminRef | null;
  usageCount: number;
  accuracy: number | null;
  duplicateOf: { id: ID; code: string } | null;
  reviewComment: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface QuestionWriteDto {
  type: QuestionType;
  difficulty: Difficulty;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  body: Localized;
  explanation: Localized;
  options: { id?: ID; text: Localized; correct: boolean }[];
  imageFileKey?: FileKey | null;
  formula?: string | null;
  tags?: string[];
  source?: string;
  year?: number | null;
}
export interface QuestionStats {
  total: number;
  published: number;
  publishedPct: number;
  inReview: number;
  duplicates: number;
  subjectCount: number;
  byStatus: Record<QuestionStatus, number>;
}
export interface SimilarDto {
  question: { id: ID; code: string; body: Localized; status: QuestionStatus };
  score: number;
}
export type QuestionAction = 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'restore';

/** UI shape (flat fields the pages render) + server refs. */
export type QuestionVM = Question & {
  subject: SubjectRef | null;
  unit: UnitRef | null;
  topic: TopicRef | null;
  author: AdminRef | null;
  reviewer: AdminRef | null;
  duplicateCode: string | null;
  accuracyKnown: boolean;
  similar?: { id: ID; code: string; body: Localized; score: number } | null;
};

export const toQuestionVM = (q: AdminQuestionDto & { similar?: QuestionVM['similar'] }): QuestionVM => ({
  id: q.id,
  code: q.code,
  subjectId: q.subjectId ?? q.subject?.id,
  unitId: q.unitId ?? q.unit?.id,
  topicId: q.topicId ?? q.topic?.id,
  type: q.type,
  difficulty: q.difficulty,
  body_en: q.body?.en ?? '',
  body_ar: q.body?.ar ?? '',
  image: q.imageUrl ?? null,
  options: (q.options ?? []).map((o) => ({ id: o.id, text_en: o.text.en, text_ar: o.text.ar, correct: o.correct })),
  explanation_en: q.explanation?.en ?? '',
  explanation_ar: q.explanation?.ar ?? '',
  tags: q.tags ?? [],
  source: q.source ?? '',
  year: q.year ?? null,
  status: q.status,
  authorId: q.author?.id ?? '',
  reviewerId: q.reviewer?.id ?? null,
  usageCount: q.usageCount ?? 0,
  accuracy: q.accuracy ?? 0,
  duplicateOf: q.duplicateOf?.id ?? null,
  reviewComment: q.reviewComment ?? null,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
  subject: q.subject ?? null,
  unit: q.unit ?? null,
  topic: q.topic ?? null,
  author: q.author ?? null,
  reviewer: q.reviewer ?? null,
  duplicateCode: q.duplicateOf?.code ?? null,
  accuracyKnown: q.accuracy != null,
  similar: q.similar,
});

/** UI question → write DTO. `imageFileKey`: undefined = unchanged. */
export const toQuestionWrite = (q: Question, imageFileKey?: FileKey | null): QuestionWriteDto => ({
  type: q.type,
  difficulty: q.difficulty,
  subjectId: q.subjectId,
  unitId: q.unitId,
  topicId: q.topicId,
  body: { en: q.body_en, ar: q.body_ar },
  explanation: { en: q.explanation_en, ar: q.explanation_ar },
  options: q.options.map((o) => ({ ...(o.id && !o.id.startsWith('opt_') ? { id: o.id } : {}), text: { en: o.text_en, ar: o.text_ar }, correct: o.correct })),
  tags: q.tags,
  source: q.source,
  year: q.year,
  ...(imageFileKey !== undefined ? { imageFileKey } : {}),
});

// ─── import ──────────────────────────────────────────────────────────────────
export interface ImportRow {
  row: number;
  raw: Record<string, string>;
  errors: Record<string, string>;
  valid: boolean;
  duplicateOf: { id: ID; code: string } | null;
  resolved: { subject: SubjectRef | null; unit: UnitRef | null; topic: TopicRef | null };
}
export interface ImportPreviewDto {
  importId: ID;
  fileName: string;
  status: 'parsing' | 'ready' | 'committed' | 'failed' | 'expired';
  totals: { rows: number; valid: number; invalid: number };
  rows: ImportRow[];
  createdAt: ISODate;
  expiresAt: ISODate;
}

const q = (id: ID) => `/admin/questions/${id}`;

export const questionsApi = {
  list: async (params: Query) => {
    const r = await api.list<AdminQuestionDto>('/admin/questions', params);
    return { items: r.items.map(toQuestionVM), meta: r.meta };
  },
  stats: () => api.get<QuestionStats>('/admin/questions/stats'),
  get: async (id: ID) => toQuestionVM(await api.get<AdminQuestionDto>(q(id))),
  create: async (body: QuestionWriteDto & { status?: 'draft' | 'in_review' }) => toQuestionVM(await api.post<AdminQuestionDto>('/admin/questions', body)),
  update: async (id: ID, body: Partial<QuestionWriteDto>) => toQuestionVM(await api.patch<AdminQuestionDto>(q(id), body)),
  remove: (id: ID) => api.delete<OkDto>(q(id)),
  transition: async (id: ID, body: { to: QuestionStatus; action: QuestionAction; comment?: string; patch?: Partial<QuestionWriteDto> }) =>
    toQuestionVM(await api.post<AdminQuestionDto>(`${q(id)}/transition`, body)),
  bulkTransition: (ids: ID[], action: 'submit' | 'approve' | 'publish' | 'archive') => api.post<BulkResult>('/admin/questions/bulk/transition', { ids, action }),
  bulkDelete: (ids: ID[]) => api.post<BulkResult>('/admin/questions/bulk/delete', { ids }),
  duplicate: async (id: ID) => toQuestionVM(await api.post<AdminQuestionDto>(`${q(id)}/duplicate`)),
  similar: (body: { topicId: ID; body: Localized | { en: string }; excludeId?: ID; threshold?: number; limit?: number }) =>
    api.post<SimilarDto[]>('/admin/questions/similar', body),
  reviewQueue: async (params?: { subjectId?: ID; q?: string }) => {
    const r = await api.list<AdminQuestionDto & { similar: QuestionVM['similar'] }>('/admin/questions/review-queue', params);
    return { items: r.items.map(toQuestionVM), meta: r.meta as PageMeta };
  },
  tags: (params?: { q?: string; limit?: number }) => api.get<{ slug: string; label: Localized | null; count: number }[]>('/admin/tags', params),
  import: {
    upload: (fileKey: FileKey) => api.post<ImportPreviewDto>('/admin/questions/import', { fileKey }),
    get: async (importId: ID, params: { filter?: 'all' | 'valid' | 'invalid'; page?: number; pageSize?: number }) => {
      const r = await api.get<ImportPreviewDto>(`/admin/questions/import/${importId}`, params);
      return r;
    },
    commit: (importId: ID) => api.post<{ imported: number; skipped: number; createdIds: ID[] }>(`/admin/questions/import/${importId}/commit`, {}, idempotency(`import-${importId}`)),
  },
};
