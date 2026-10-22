/** AI-tutor RAG: knowledge-base chunking/hashing/scoping, OpenAI model parameters + embeddings, prompt helpers. No network. */
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { chunkDoc, chunkText, kbScopeForMutation, mergeScopes, type KbDoc } from '../../src/modules/ai-tutor/knowledge-base.js';
import { isOpenAiReasoningModel, OpenAiCompatibleProvider, openAiSamplingParams } from '../../src/modules/ai-tutor/providers/http.js';
import { MockAiProvider } from '../../src/modules/ai-tutor/providers/mock.js';
import type { AiGenerateRequest } from '../../src/modules/ai-tutor/providers/types.js';
import { citationsFor, normalizeMathDelimiters, systemPrompt } from '../../src/modules/ai-tutor/service.js';
import { fakeHttp } from './helpers/fake-http.js';

const doc = (over: Partial<KbDoc> = {}): KbDoc => ({
  sourceType: 'lesson',
  sourceId: '11111111-1111-4111-8111-111111111111',
  subjectId: null,
  unitId: null,
  lessonId: '11111111-1111-4111-8111-111111111111',
  locale: 'ar',
  title: 'المشتقات',
  body: 'المشتقة هي معدل التغير. ما هي قاعدة الضرب؟ هي $(uv)\' = u\'v + uv\'$.',
  ...over,
});

describe('knowledge base chunking', () => {
  it('splits long text on sentence boundaries (Arabic ؟ included) within the size limit', () => {
    const text = Array.from({ length: 40 }, (_, i) => `جملة رقم ${i} تشرح فكرة مهمة في الدرس؟`).join(' ');
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
    expect(chunkText('   ')).toEqual([]);
  });

  it('prefixes every chunk with the title and hashes model + title + content', () => {
    const a = chunkDoc(doc({ body: 'x. '.repeat(600) }), 'text-embedding-3-small', 300);
    expect(a.length).toBeGreaterThan(1);
    for (const c of a) expect(c.content.startsWith('المشتقات\n')).toBe(true);
    const b = chunkDoc(doc({ body: 'x. '.repeat(600) }), 'text-embedding-3-small', 300);
    expect(b.map((c) => c.hash)).toEqual(a.map((c) => c.hash)); // unchanged content → same hash → skipped
    const otherModel = chunkDoc(doc({ body: 'x. '.repeat(600) }), 'other-model', 300);
    expect(otherModel[0]?.hash).not.toBe(a[0]?.hash);
    expect(chunkDoc(doc({ body: '' }), 'm')).toHaveLength(1); // title-only doc still indexed
  });

  it('maps admin mutations to the affected part of the index', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(kbScopeForMutation(`/api/v1/admin/lessons/${id}`, 'lesson', id)).toEqual({ ids: { lesson: [id] } });
    expect(kbScopeForMutation('/api/v1/admin/lessons', 'lesson', null)).toEqual({ types: ['lesson', 'unit', 'topic'] });
    expect(kbScopeForMutation(`/api/v1/admin/questions/${id}/transition`, null, id)).toEqual({ ids: { question_explanation: [id] } });
    expect(kbScopeForMutation('/api/v1/admin/questions/bulk/transition', null, null)).toEqual({ types: ['question_explanation'] });
    expect(kbScopeForMutation(`/api/v1/admin/units/${id}`, 'unit', id)?.types).toContain('lesson');
    expect(kbScopeForMutation(`/api/v1/admin/cms/faq/${id}`, 'cms_faq', id)).toEqual({ types: ['faq'] });
    expect(kbScopeForMutation('/api/v1/admin/packages/x', 'package', 'x')).toBeNull();
  });

  it('merges debounced scopes (full types win over ids; undefined = full index)', () => {
    const m = mergeScopes({ ids: { lesson: ['a'], faq: ['f'] } }, { types: ['faq'], ids: { lesson: ['b'] } });
    expect(m).toEqual({ types: ['faq'], ids: { lesson: ['a', 'b'] } });
    expect(mergeScopes(undefined, { types: ['faq'] })).toBeUndefined();
  });
});

describe('OpenAI chat parameters', () => {
  it('reasoning models get max_completion_tokens + reasoning_effort and no temperature', () => {
    expect(isOpenAiReasoningModel('gpt-6-luna')).toBe(true);
    expect(isOpenAiReasoningModel('gpt-5.4-mini')).toBe(true);
    expect(isOpenAiReasoningModel('o3-mini')).toBe(true);
    expect(isOpenAiReasoningModel('gpt-4o')).toBe(false);
    expect(isOpenAiReasoningModel('gpt-4o-azure')).toBe(false);
    expect(openAiSamplingParams('gpt-6-luna', { temperature: 0.3, maxTokens: 1024 }, 'low')).toEqual({ max_completion_tokens: 2048, reasoning_effort: 'low' });
    expect(openAiSamplingParams('gpt-4o-mini', { temperature: 0.3, maxTokens: 1024 })).toEqual({ max_tokens: 1024, temperature: 0.3 });
  });

  it('streams a reasoning model with usage (tokens feed the allowance/cost accounting)', async () => {
    const chunks = [
      `data: ${JSON.stringify({ model: 'gpt-6-luna', choices: [{ delta: { content: 'مرحبا' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 35 } })}\n\n`,
      'data: [DONE]\n\n',
    ];
    const f = fakeHttp(() => ({ data: Readable.from(chunks) }));
    const p = new OpenAiCompatibleProvider('openai', 'https://api.openai.com/v1', 'sk-x', false, f.http, 'low');
    const req: AiGenerateRequest = { model: 'gpt-6-luna', system: 's', messages: [{ role: 'user', content: 'سؤال' }], temperature: 0.3, maxTokens: 512, lang: 'ar', subjectSlug: null, context: [] };
    const r = await p.stream(req, () => undefined);
    expect(r).toMatchObject({ text: 'مرحبا', tokensIn: 120, tokensOut: 35, model: 'gpt-6-luna' });
    const body = f.body();
    expect(body).toMatchObject({ model: 'gpt-6-luna', max_completion_tokens: 1536, reasoning_effort: 'low', stream: true });
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it('batch embeddings come back in input order with token usage', async () => {
    const f = fakeHttp(() => ({ data: { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 7, total_tokens: 7 } } }));
    const p = new OpenAiCompatibleProvider('openai', 'https://api.openai.com/v1', 'sk-x', false, f.http);
    const r = await p.embed(['a', 'b'], 'text-embedding-3-small');
    expect(r).toEqual({ vectors: [[1, 0], [0, 1]], tokens: 7 });
    expect(f.calls[0]?.url).toBe('https://api.openai.com/v1/embeddings');
    expect(f.body()).toEqual({ model: 'text-embedding-3-small', input: ['a', 'b'] });
  });

  it('mock embeddings are deterministic unit vectors', async () => {
    const m = new MockAiProvider(0);
    const { vectors, tokens } = await m.embed(['derivative chain rule', 'derivative chain rule']);
    expect(vectors[0]).toEqual(vectors[1]);
    expect(Math.hypot(...(vectors[0] ?? []))).toBeCloseTo(1, 6);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('tutor prompt helpers', () => {
  it('Arabic by default persona for Iraqi 6th scientific with $-LaTeX rules', () => {
    const p = systemPrompt('No cheating.', 'ar', { en: 'Mathematics', ar: 'الرياضيات' });
    expect(p).toContain('السادس الإعدادي العلمي');
    expect(p).toContain('$$…$$');
    expect(p).toContain('Modern Standard Arabic');
    expect(p).toContain('No cheating.');
    expect(systemPrompt('', 'en', null)).toContain('Answer in English');
  });

  it('rewrites \\( \\) and \\[ \\] delimiters to the $ dialect', () => {
    expect(normalizeMathDelimiters('a \\(x^2\\) b \\[ \\frac{1}{2} \\] c')).toBe('a $x^2$ b $$\\frac{1}{2}$$ c');
    expect(normalizeMathDelimiters('already $x$ and $$y$$')).toBe('already $x$ and $$y$$');
  });

  it('citations: one per source, max 3, never the student notes', () => {
    const c = (type: string, id: string, title = id) => ({ sourceType: type as 'lesson', sourceId: id, lessonId: null, title, content: '', score: 1 });
    const out = citationsFor([c('lesson', 'a'), c('lesson', 'a'), c('lesson_notes', 'n'), c('faq', 'f'), c('unit', 'u'), c('topic', 't')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'f', 'u']);
    expect(out[0]).toEqual({ type: 'lesson', id: 'a', lessonId: null, subjectId: null, title: 'a' });
  });
});
