/**
 * Safety helpers (pure): Arabic-aware normalisation, admin blocked keywords, and heuristic abuse classification
 * that raises `ai_flags` (source `auto`) without blocking the message.
 */
export type AiFlagReason = 'off_topic' | 'abuse' | 'cheating' | 'prompt_injection' | 'self_harm';
export type Severity = 'low' | 'medium' | 'high';

/** Lower-case, strip Arabic diacritics/tatweel, fold alef/yaa/taa-marbuta variants, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First admin-configured keyword contained in the text (case/diacritics-insensitive), else null. */
export function findBlockedKeyword(text: string, keywords: readonly string[]): string | null {
  const hay = normalizeText(text);
  for (const k of keywords) {
    const needle = normalizeText(k);
    if (needle && hay.includes(needle)) return k;
  }
  return null;
}

const RULES: { reason: AiFlagReason; severity: Severity; patterns: RegExp[] }[] = [
  {
    reason: 'self_harm',
    severity: 'high',
    patterns: [/\b(kill|hurt|harm)\s+myself\b/, /\bsuicid/, /\bend my life\b/, /انتحار/, /اقتل نفسي/, /اذي نفسي/, /انهي حياتي/],
  },
  {
    reason: 'prompt_injection',
    severity: 'medium',
    patterns: [
      /ignore (all |the )?(previous|prior|above) (instructions|rules)/,
      /(reveal|show|print) (your|the) (system )?prompt/,
      /\bjailbreak\b/,
      /\bdan mode\b/,
      /تجاهل (كل |جميع )?(التعليمات|القواعد)/,
      /اظهر (لي )?(التعليمات|البرومبت)/,
    ],
  },
  {
    reason: 'cheating',
    severity: 'high',
    patterns: [
      /(leak|leaked|send|give).{0,30}(exam|test) (answers|questions)/,
      /answers? (to|for) (the )?(ministerial|final) exam/,
      /اجوبه (الامتحان|الوزاري)/,
      /اسئله (الامتحان |)الوزاري.{0,20}(قبل|مسربه|تسريب)/,
      /تسريب (الاسئله|الامتحان)/,
    ],
  },
  {
    reason: 'abuse',
    severity: 'medium',
    patterns: [/\b(fuck|shit|bitch|bastard)\b/, /(كلب|حمار|غبي) (انت|انتي)/, /يلعن/],
  },
];

/** Heuristic classification of a student message; null when nothing suspicious was found. */
export function classifyMessage(text: string): { reason: AiFlagReason; severity: Severity } | null {
  const t = normalizeText(text);
  for (const r of RULES) if (r.patterns.some((p) => p.test(t))) return { reason: r.reason, severity: r.severity };
  return null;
}

/** Excerpt stored on flags (single line, max 280 chars). */
export function excerpt(text: string, max = 280): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
