import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  API_URL,
  ApiError,
  baseHeaders,
  del,
  errorFromResponse,
  get,
  getPaged,
  getValidAccessToken,
  patch,
  post,
  qs,
  refreshAccessToken,
} from './client';
import { keys } from './keys';
import type {
  AiAllowance,
  ConversationDto,
  ConversationSummary,
  Localized,
  SendTutorMessageBody,
  TutorMessage,
  TutorPollingStartDto,
} from './types';

/** AI tutor (AIT-01…10). Answers stream over SSE (fetch + ReadableStream so the bearer header is sent). */
export const aiApi = {
  allowance: () => get<AiAllowance>('/ai-tutor/allowance'),
  suggestions: (subjectId: string) => get<Localized[]>(`/ai-tutor/suggestions${qs({ subjectId })}`),
  conversations: (subjectId?: string) => getPaged<ConversationSummary>(`/ai-tutor/conversations${qs({ subjectId, pageSize: 20 })}`),
  create: (subjectId: string, title?: string) => post<ConversationDto>('/ai-tutor/conversations', { subjectId, title }),
  conversation: (id: string) => get<ConversationDto>(`/ai-tutor/conversations/${id}`),
  rename: (id: string, body: { subjectId?: string; title?: string }) => patch<ConversationSummary>(`/ai-tutor/conversations/${id}`, body),
  remove: (id: string) => del<{ ok: true }>(`/ai-tutor/conversations/${id}`),
  message: (id: string) => get<TutorMessage>(`/ai-tutor/messages/${id}`),
  feedback: (id: string, rating: 'up' | 'down' | null) => post<TutorMessage>(`/ai-tutor/messages/${id}/feedback`, { rating }),
};

export interface StreamHandlers {
  onMeta?: (m: { studentMessage: TutorMessage; tutorMessageId: string; allowance: AiAllowance }) => void;
  onDelta?: (text: string) => void;
}
export interface StreamResult {
  message: TutorMessage;
  allowance: AiAllowance | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls AIT-09 until the tutor message settles (fallback + reconnect path). */
async function pollMessage(id: string, seen: string, handlers: StreamHandlers, signal?: AbortSignal, everyMs = 800): Promise<TutorMessage> {
  let text = seen;
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const m = await aiApi.message(id);
    if (m.text.length > text.length && m.text.startsWith(text)) handlers.onDelta?.(m.text.slice(text.length));
    else if (m.text !== text && m.text.length > 0) handlers.onDelta?.(m.text.slice(text.length));
    text = m.text;
    if (m.status === 'complete' || m.status === 'failed' || m.status === 'blocked') return m;
    if (Date.now() - started > 120_000) return { ...m, status: 'failed' };
    await sleep(everyMs);
  }
}

function sseError(data: { code?: string; reason?: string; message?: string; allowance?: AiAllowance }) {
  return new ApiError({
    code: (data.code as ApiError['code']) ?? 'INTERNAL',
    message: data.message ?? '',
    status: 0,
    details: { reason: data.reason, allowance: data.allowance },
  });
}

/**
 * Sends a student message (AIT-08). Uses SSE when the browser can read response streams; otherwise
 * the JSON (polling) mode. If the stream drops after `meta`, recovers by polling the tutor message.
 */
export async function sendTutorMessage(
  conversationId: string,
  body: SendTutorMessageBody,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const canStream = typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';
  const url = `${API_URL}/ai-tutor/conversations/${conversationId}/messages`;

  const doFetch = async (retried = false): Promise<Response> => {
    const token = await getValidAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        ...baseHeaders(),
        Accept: canStream ? 'text/event-stream' : 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && !retried) {
      const err = await errorFromResponse(res.clone());
      if (err.code === 'TOKEN_EXPIRED' && (await refreshAccessToken().catch(() => null))) return doFetch(true);
    }
    return res;
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError({ code: 'NETWORK_ERROR', message: '', status: 0 });
  }
  if (!res.ok) throw await errorFromResponse(res);

  const contentType = res.headers.get('content-type') ?? '';

  // Polling mode (JSON response).
  if (!contentType.includes('text/event-stream') || !res.body) {
    const json = (await res.json()) as { data: TutorPollingStartDto };
    const start = json.data;
    handlers.onMeta?.({ studentMessage: start.studentMessage, tutorMessageId: start.tutorMessage.id, allowance: start.allowance });
    const message = await pollMessage(start.tutorMessage.id, start.tutorMessage.text ?? '', handlers, signal, start.pollAfterMs || 800);
    return { message, allowance: null };
  }

  // SSE mode.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let tutorMessageId: string | null = null;
  let streamed = '';

  const handleEvent = (event: string, raw: string): StreamResult | null => {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (event === 'meta') {
      const m = data as { studentMessage: TutorMessage; tutorMessageId: string; allowance: AiAllowance };
      tutorMessageId = m.tutorMessageId;
      handlers.onMeta?.(m);
    } else if (event === 'delta') {
      const text = (data as { text: string }).text ?? '';
      streamed += text;
      handlers.onDelta?.(text);
    } else if (event === 'done') {
      return data as StreamResult;
    } else if (event === 'error') {
      throw sseError(data as { code?: string; reason?: string; message?: string });
    }
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of chunk.split(/\r?\n/)) {
          if (!line || line.startsWith(':')) continue; // heartbeat comment
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (!dataLines.length) continue;
        const result = handleEvent(event, dataLines.join('\n'));
        if (result) return result;
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError' || e instanceof ApiError) throw e;
    // Stream dropped — fall through to reconnect via polling.
  }

  if (tutorMessageId) {
    const message = await pollMessage(tutorMessageId, streamed, handlers, signal);
    return { message, allowance: null };
  }
  throw new ApiError({ code: 'NETWORK_ERROR', message: '', status: 0 });
}

/* ------------------------------------------------------------------ hooks */

export function useAiAllowance() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.aiAllowance, queryFn: aiApi.allowance, enabled: isAuthenticated });
}

export function useAiSuggestions(subjectId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.aiSuggestions(subjectId ?? ''),
    queryFn: () => aiApi.suggestions(subjectId!),
    enabled: !!subjectId && isAuthenticated,
    staleTime: 60 * 60 * 1000,
    meta: { silent: true },
  });
}

export function useAiConversations(subjectId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.aiConversations(subjectId),
    queryFn: () => aiApi.conversations(subjectId),
    enabled: !!subjectId && isAuthenticated,
  });
}

export function useAiConversation(id: string | null | undefined) {
  return useQuery({ queryKey: keys.aiConversation(id ?? ''), queryFn: () => aiApi.conversation(id!), enabled: !!id });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectId, title }: { subjectId: string; title?: string }) => aiApi.create(subjectId, title),
    onSuccess: (conv) => {
      qc.setQueryData(keys.aiConversation(conv.id), conv);
      void qc.invalidateQueries({ queryKey: [...keys.ai, 'conversations'] });
    },
  });
}

export function useRateMessage() {
  return useMutation({ mutationFn: ({ id, rating }: { id: string; rating: 'up' | 'down' | null }) => aiApi.feedback(id, rating) });
}
