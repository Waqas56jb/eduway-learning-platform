/** Caption cue parsed from a signed WebVTT track (StreamUrlDto.captions). */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

function toSec(ts: string): number {
  const parts = ts.trim().replace(',', '.').split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Minimal WebVTT parser (cue timings + text; styling tags stripped). */
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx]!.split('-->');
    const end = (b ?? '').trim().split(/\s+/)[0] ?? '';
    const text = lines
      .slice(timeIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (text) cues.push({ start: toSec(a ?? ''), end: toSec(end), text });
  }
  return cues;
}

/** Cue text at `sec`, or null. */
export function cueAt(cues: Cue[], sec: number): string | null {
  for (const c of cues) if (sec >= c.start && sec < c.end) return c.text;
  return null;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export const QUALITIES = ['auto', '1080p', '720p', '480p'] as const;
export type Quality = (typeof QUALITIES)[number];
