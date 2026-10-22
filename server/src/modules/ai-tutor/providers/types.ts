/** AI provider abstraction — every backend (offline mock, OpenAI-compatible, Anthropic) implements AiProvider. */

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Signed URL of an attached image (vision models). */
  imageUrl?: string | null;
}

export type KnowledgeSourceType = 'lesson' | 'unit' | 'topic' | 'question_explanation' | 'faq';

export interface RetrievedChunk {
  sourceType: KnowledgeSourceType | 'lesson_transcript' | 'lesson_notes' | 'lesson_description';
  sourceId: string;
  lessonId: string | null;
  /** Title in the answer language (shown to the model and used as the citation label). */
  title: string;
  /** Bilingual citation label when known (lesson / unit / topic / FAQ title). */
  titles?: { en: string; ar: string };
  subjectId?: string | null;
  content: string;
  score: number;
}

/** Embeddings + the provider-reported token usage (for the knowledge-base cost estimate). */
export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

export interface AiGenerateRequest {
  model: string;
  system: string;
  messages: AiChatMessage[];
  temperature: number;
  maxTokens: number;
  lang: 'en' | 'ar';
  subjectSlug: string | null;
  context: RetrievedChunk[];
  signal?: AbortSignal;
}

export interface AiGenerateResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
}

export interface AiProvider {
  readonly name: string;
  /** Streams the answer; `onDelta` receives appended text chunks in order. Resolves with the full text + usage. */
  stream(req: AiGenerateRequest, onDelta: (text: string) => void): Promise<AiGenerateResult>;
  /** Optional embeddings (pgvector retrieval). Vectors are returned in input order. */
  embed?(texts: string[], model: string): Promise<EmbedResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
