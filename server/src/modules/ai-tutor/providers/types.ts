/** AI provider abstraction — every backend (offline mock, OpenAI-compatible, Anthropic) implements AiProvider. */

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Signed URL of an attached image (vision models). */
  imageUrl?: string | null;
}

export interface RetrievedChunk {
  sourceType: 'lesson_transcript' | 'question_explanation' | 'lesson_notes' | 'lesson_description';
  sourceId: string;
  lessonId: string | null;
  title: string;
  content: string;
  score: number;
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
  /** Optional embeddings (pgvector retrieval). */
  embed?(texts: string[], model: string): Promise<number[][]>;
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
