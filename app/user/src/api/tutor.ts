import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { API_URL } from './config';
import { baseHeaders, del, get, getPaged, patch, post, refreshAccessToken } from './client';
import { markOffline, markOnline } from './connectivity';
import { ApiError } from './errors';
import { qk } from './keys';
import { getAccessToken } from './session';
import type {
  AiAllowance,
  ConversationDto,
  ConversationSummary,
  ErrorCode,
  OkDto,
  TutorMessageDto,
  TutorSendBody,
  TutorSendPollingDto,
} from './types';
import type { Localized } from '@/types';

// AIT-01
export const useAiAllowance = (enabled = true) =>
  useQuery({
    queryKey: qk.tutor.allowance,
    queryFn: () => get<AiAllowance>('/ai-tutor/allowance'),
    enabled,
    meta: { silent: true },
  });

// AIT-02
export const useTutorSuggestions = (subjectId: string | undefined) =>
  useQuery({
    queryKey: qk.tutor.suggestions(subjectId ?? ''),
    queryFn: () => get<Localized[]>('/ai-tutor/suggestions', { subjectId }),
    enabled: !!subjectId,
    staleTime: 60 * 60_000,
    meta: { silent: true },
  });

// AIT-03
export const useConversations = (subjectId?: string) =>
  useQuery({
    queryKey: qk.tutor.conversations(subjectId),
    queryFn: async () => (await getPaged<ConversationSummary>('/ai-tutor/conversations', { subjectId, pageSize: 50 })).items,
    meta: { silent: true },
  });

// AIT-04
export const createConversation = (subjectId: string, title?: string) =>
  post<ConversationDto>('/ai-tutor/conversations', { subjectId, title });

// AIT-05
export const fetchConversation = (id: string) => get<ConversationDto>(`/ai-tutor/conversations/${id}`, { limit: 50 });
export const useConversation = (id: string | null | undefined) =>
  useQuery({ queryKey: qk.tutor.conversation(id ?? ''), queryFn: () => fetchConversation(id!), enabled: !!id });

// AIT-06
export const updateConversation = (id: string, body: { subjectId?: string; title?: string }) =>
  patch<ConversationSummary>(`/ai-tutor/conversations/${id}`, body);

// AIT-07
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<OkDto>(`/ai-tutor/conversations/${id}`),
    onMutate: async (id) => {
      const lists = qc.getQueriesData<ConversationSummary[]>({ queryKey: ['tutor', 'conversations'] });
      lists.forEach(([key, data]) => data && qc.setQueryData(key, data.filter((c) => c.id !== id)));
      return { lists };
    },
    onError: (_e, _id, ctx) => ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tutor', 'conversations'] }),
  });
}

// AIT-09
export const fetchTutorMessage = (id: string) => get<TutorMessageDto>(`/ai-tutor/messages/${id}`);

// AIT-10
export const rateTutorMessage = (id: string, rating: 'up' | 'down' | null) =>
  post<TutorMessageDto>(`/ai-tutor/messages/${id}/feedback`, { rating });

// ── AIT-08 streaming send ───────────────────────────────────────────────────
export interface TutorStreamHandlers {
  onMeta?: (d: { studentMessage: TutorMessageDto; tutorMessageId: string; allowance: AiAllowance }) => void;
  onDelta?: (text: string) => void;
}
export interface TutorSendResult {
  studentMessage: TutorMessageDto | null;
  message: TutorMessageDto;
  allowance: AiAllowance | null;
}

/** Minimal streaming UTF-8 decoder (Hermes' TextDecoder lacks `stream` support on some versions). */
function createUtf8Decoder() {
  let pending: number[] = [];
  return (chunk: Uint8Array): string => {
    const bytes = pending.length ? Uint8Array.from([...pending, ...chunk]) : chunk;
    pending = [];
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i]!;
      const need = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (i + need > bytes.length) {
        pending = Array.from(bytes.slice(i));
        break;
      }
      let cp = need === 1 ? b : b & (0xff >> (need + 1));
      for (let k = 1; k < need; k++) cp = (cp << 6) | (bytes[i + k]! & 0x3f);
      out += String.fromCodePoint(cp);
      i += need;
    }
    return out;
  };
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseBlocks(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // heartbeat comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polling fallback: wait until the tutor message is final. */
async function pollUntilDone(id: string, firstDelayMs: number, onDelta?: (t: string) => void, signal?: AbortSignal) {
  let delay = Math.max(400, firstDelayMs);
  let shown = '';
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(delay);
    if (signal?.aborted) throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'aborted' });
    const msg = await fetchTutorMessage(id);
    if (msg.text.length > shown.length && onDelta) {
      onDelta(msg.text.slice(shown.length));
      shown = msg.text;
    }
    if (msg.status === 'complete' || msg.status === 'failed' || msg.status === 'blocked') return msg;
    delay = Math.min(2000, delay + 200);
  }
  return fetchTutorMessage(id);
}

async function openStream(conversationId: string, body: TutorSendBody, signal?: AbortSignal) {
  const token = getAccessToken();
  return expoFetch(`${API_URL}/ai-tutor/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Send a tutor message. Uses SSE through `expo/fetch` (streaming bodies work in Expo Go); if the server answers
 * with JSON instead (or streaming is unavailable) it falls back to polling AIT-09 as the contract describes.
 */
export async function sendTutorMessage(
  conversationId: string,
  body: TutorSendBody,
  handlers: TutorStreamHandlers = {},
  signal?: AbortSignal,
): Promise<TutorSendResult> {
  let res;
  try {
    res = await openStream(conversationId, body, signal);
    if (res.status === 401) {
      await refreshAccessToken();
      res = await openStream(conversationId, body, signal);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal?.aborted) throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });
    markOffline();
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });
  }
  markOnline();

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      // non-JSON error
    }
    const details = payload.error?.details ?? {};
    throw new ApiError({
      status: res.status,
      code: (payload.error?.code ?? 'INTERNAL') as ErrorCode,
      message: payload.error?.message ?? '',
      reason: typeof details.reason === 'string' ? details.reason : null,
      details,
    });
  }

  // Polling mode: the server answered with the JSON envelope.
  if (!contentType.includes('text/event-stream')) {
    const json = (await res.json()) as { data: TutorSendPollingDto };
    const d = json.data;
    handlers.onMeta?.({ studentMessage: d.studentMessage, tutorMessageId: d.tutorMessage.id, allowance: d.allowance });
    const message = await pollUntilDone(d.tutorMessage.id, d.pollAfterMs, handlers.onDelta, signal);
    return { studentMessage: d.studentMessage, message, allowance: null };
  }

  let studentMessage: TutorMessageDto | null = null;
  let tutorMessageId: string | null = null;
  let final: { message: TutorMessageDto; allowance: AiAllowance } | null = null;
  let streamError: ApiError | null = null;

  const handle = (ev: SseEvent) => {
    try {
      const data = JSON.parse(ev.data) as Record<string, unknown>;
      if (ev.event === 'meta') {
        const m = data as unknown as { studentMessage: TutorMessageDto; tutorMessageId: string; allowance: AiAllowance };
        studentMessage = m.studentMessage;
        tutorMessageId = m.tutorMessageId;
        handlers.onMeta?.(m);
      } else if (ev.event === 'delta') {
        handlers.onDelta?.(String(data.text ?? ''));
      } else if (ev.event === 'done') {
        final = data as unknown as { message: TutorMessageDto; allowance: AiAllowance };
      } else if (ev.event === 'error') {
        streamError = new ApiError({
          status: 422,
          code: (data.code as ErrorCode) ?? 'BUSINESS_RULE',
          reason: (data.reason as string | undefined) ?? null,
          message: String(data.message ?? ''),
          details: data.allowance ? { allowance: data.allowance } : {},
        });
      }
    } catch {
      // ignore malformed event
    }
  };

  const stream = res.body;
  if (stream) {
    const reader = stream.getReader();
    const decode = createUtf8Decoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decode(value);
        const { events, rest } = parseSseBlocks(buffer);
        buffer = rest;
        events.forEach(handle);
      }
      if (buffer.trim()) parseSseBlocks(`${buffer}\n\n`).events.forEach(handle);
    } catch {
      // stream dropped — recover via polling below
    }
  } else {
    parseSseBlocks(`${await res.text()}\n\n`).events.forEach(handle);
  }

  if (streamError) throw streamError;
  const done = final as { message: TutorMessageDto; allowance: AiAllowance } | null;
  if (done) return { studentMessage, message: done.message, allowance: done.allowance };
  if (tutorMessageId) {
    const message = await pollUntilDone(tutorMessageId, 500, undefined, signal);
    return { studentMessage, message, allowance: null };
  }
  throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });
}
