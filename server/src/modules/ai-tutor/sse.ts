/**
 * Server-Sent Events framing for AIT-08 (API_CONTRACT §12 / §33).
 *
 *   const sse = new SseWriter(res).open();
 *   sse.send('meta', { … }); sse.send('delta', { text }); sse.send('done', { … }); sse.close();
 *
 * Frames: `event: <name>\nid: <n>\ndata: <json line>\n\n`. JSON never contains raw newlines (JSON.stringify escapes
 * them), but multi-line payloads are still split into several `data:` lines per the SSE spec. A comment frame
 * (`: ping`) is written every `heartbeatMs` (15 s) so proxies keep the connection open.
 */
import type { Response } from 'express';

export type SseEventName = 'meta' | 'delta' | 'done' | 'error';

/** One SSE frame (terminated by a blank line). */
export function sseFrame(event: string, data: unknown, id?: string | number): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const lines = payload.split(/\r\n|\r|\n/).map((l) => `data: ${l}`);
  return `event: ${event}\n${id !== undefined ? `id: ${id}\n` : ''}${lines.join('\n')}\n\n`;
}

/** Comment frame (ignored by EventSource; used for heartbeats). */
export function sseComment(text: string): string {
  return `: ${text.replace(/[\r\n]+/g, ' ')}\n\n`;
}

/** Parse SSE text back into events (used by tests and by the HTTP AI providers to read upstream streams). */
export function parseSse(text: string): { event: string; data: string; id?: string }[] {
  const out: { event: string; data: string; id?: string }[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    let event = 'message';
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue;
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
      else if (field === 'id') id = value;
    }
    if (data.length || event !== 'message') out.push({ event, data: data.join('\n'), ...(id !== undefined ? { id } : {}) });
  }
  return out;
}

export interface SseSink {
  setHeader(name: string, value: string): unknown;
  write(chunk: string): boolean;
  end(): unknown;
  flushHeaders?(): void;
  status?(code: number): unknown;
  on?(event: 'close', cb: () => void): unknown;
}

export class SseWriter {
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;
  private ended = false;

  constructor(
    private readonly res: SseSink | Response,
    private readonly heartbeatMs = 15_000,
  ) {}

  get closed(): boolean {
    return this.ended;
  }

  open(): this {
    const r = this.res as SseSink;
    r.status?.(200);
    r.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    r.setHeader('Cache-Control', 'no-cache, no-transform');
    r.setHeader('Connection', 'keep-alive');
    r.setHeader('X-Accel-Buffering', 'no');
    r.flushHeaders?.();
    r.write('retry: 3000\n\n');
    if (this.heartbeatMs > 0) {
      this.timer = setInterval(() => {
        if (!this.ended) r.write(sseComment('ping'));
      }, this.heartbeatMs);
      this.timer.unref?.();
    }
    r.on?.('close', () => this.stop());
    return this;
  }

  send(event: SseEventName, data: unknown): boolean {
    if (this.ended) return false;
    this.seq += 1;
    return (this.res as SseSink).write(sseFrame(event, data, this.seq));
  }

  /** Stop heartbeats without ending the response (client went away). */
  stop(): void {
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close(): void {
    if (this.ended) return;
    this.stop();
    (this.res as SseSink).end();
  }
}

/** True when the client asked for an event stream (AIT-08 mode switch). */
export function wantsEventStream(accept: string | undefined): boolean {
  return !!accept && accept.split(',').some((p) => p.trim().toLowerCase().startsWith('text/event-stream'));
}
