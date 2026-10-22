/**
 * MockAiProvider — deterministic, offline tutor used by default in development/tests (no API key needed).
 * Answers come from the seeded bilingual tutor answers (keyword match, same data the apps used as mocks),
 * then from retrieved question explanations / lesson descriptions, then a generic study-method fallback.
 * Streams token-by-token while keeping LaTeX blocks (`$…$`, `$$…$$`) atomic so partial renders stay valid.
 */
import tutorData from '../../../db/seed/data/student-extras.json' with { type: 'json' };
import { estimateTokens } from '../allowance.js';
import { normalizeText } from '../safety.js';
import type { AiGenerateRequest, AiGenerateResult, AiProvider, EmbedResult } from './types.js';

interface Localized {
  en: string;
  ar: string;
}
interface CannedAnswer {
  keywords: string[];
  subjectId: string;
  answer: Localized;
}

const DATA = tutorData as unknown as { tutorAnswers: CannedAnswer[]; tutorFallback: Localized };

/** Split into stream tokens: words + whitespace, LaTeX math kept whole. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\s+|[^\s$]+|\$/g;
  for (const m of text.matchAll(re)) out.push(m[0]);
  return out;
}

export function pickCannedAnswer(question: string, subjectSlug: string | null): CannedAnswer | null {
  const q = normalizeText(question);
  let best: { a: CannedAnswer; hits: number } | null = null;
  for (const a of DATA.tutorAnswers) {
    const hits = a.keywords.filter((k) => q.includes(normalizeText(k))).length;
    if (!hits) continue;
    const bonus = subjectSlug && a.subjectId === subjectSlug ? 0.5 : 0;
    if (!best || hits + bonus > best.hits) best = { a, hits: hits + bonus };
  }
  return best?.a ?? null;
}

export function composeMockAnswer(req: Pick<AiGenerateRequest, 'messages' | 'lang' | 'subjectSlug' | 'context'>): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  const question = last?.content ?? '';
  const canned = pickCannedAnswer(question, req.subjectSlug);
  if (canned) return canned.answer[req.lang];

  const ctx = req.context.find((c) => c.sourceType === 'question_explanation') ?? req.context[0];
  if (ctx && ctx.content.trim()) {
    const intro = req.lang === 'ar' ? `إليك ما وجدته في دروسك حول **${ctx.title}**:` : `Here is what your lessons say about **${ctx.title}**:`;
    const outro =
      req.lang === 'ar'
        ? 'هل تريد أن نحل مثالاً مشابهاً خطوة بخطوة؟'
        : 'Would you like to work through a similar example step by step?';
    return `${intro}\n\n${ctx.content.trim()}\n\n${outro}`;
  }
  if (last?.imageUrl && !question.trim()) {
    return req.lang === 'ar'
      ? 'استلمت الصورة. صف لي ما المطلوب في السؤال (أو اكتب نصه) وسأشرح الحل خطوة بخطوة.'
      : "I received your image. Tell me what the question asks (or type it out) and I'll explain the solution step by step.";
  }
  return DATA.tutorFallback[req.lang];
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  /** `tokenDelayMs` simulates network streaming (0 in tests). */
  constructor(private readonly tokenDelayMs = 12) {}

  async stream(req: AiGenerateRequest, onDelta: (text: string) => void): Promise<AiGenerateResult> {
    const text = composeMockAnswer(req);
    for (const tok of tokenize(text)) {
      if (req.signal?.aborted) break;
      onDelta(tok);
      if (this.tokenDelayMs > 0) await new Promise((r) => setTimeout(r, this.tokenDelayMs));
    }
    const prompt = [req.system, ...req.context.map((c) => c.content), ...req.messages.map((m) => m.content)].join('\n');
    return { text, tokensIn: estimateTokens(prompt), tokensOut: estimateTokens(text), model: `mock:${req.model}`, provider: this.name };
  }

  /** Deterministic pseudo-embeddings (hash buckets) so the vector path can be exercised offline. */
  async embed(texts: string[]): Promise<EmbedResult> {
    const vectors = texts.map((t) => {
      const v = new Array<number>(1536).fill(0);
      for (const w of normalizeText(t).split(/\W+/u).filter(Boolean)) {
        let h = 0;
        for (const ch of w) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
        v[h % 1536] = (v[h % 1536] ?? 0) + 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
    return { vectors, tokens: texts.reduce((n, t) => n + estimateTokens(t), 0) };
  }
}
