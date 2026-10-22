import type { MistakeEntryDto } from '@/api/types';
import type { Localized, MistakeStatus, SubjectId } from '@/types';

/** A mistake as returned by the API (embedded question with answer + explanation, subject/unit/topic refs). */
export type MistakeEntry = MistakeEntryDto;

/** UI filter; "repeated" = repeatCount >= 2 regardless of status. */
export type MistakeFilter = MistakeStatus | 'repeated';

export interface MistakeSection {
  key: string;
  subjectId: SubjectId;
  subjectName: Localized;
  unitTitle: Localized | null;
  data: MistakeEntry[];
}

/**
 * Group mistakes by subject → unit. The server already orders entries by subject order → unit order → date,
 * so sections keep first-appearance order; entries inside a section are newest first.
 */
export function groupMistakes(entries: MistakeEntry[]): MistakeSection[] {
  const map = new Map<string, MistakeSection>();
  for (const entry of entries) {
    const key = `${entry.subject.slug}:${entry.unit.id}`;
    let section = map.get(key);
    if (!section) {
      section = {
        key,
        subjectId: entry.subject.slug as SubjectId,
        subjectName: entry.subject.name,
        unitTitle: entry.unit.name ?? null,
        data: [],
      };
      map.set(key, section);
    }
    section.data.push(entry);
  }
  return [...map.values()].map((s) => ({
    ...s,
    data: [...s.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  }));
}

export const statusTone = (status: MistakeStatus): 'danger' | 'info' | 'success' =>
  status === 'unresolved' ? 'danger' : status === 'reviewed' ? 'info' : 'success';

/** Next unresolved mistake after `currentId` (wraps around), or undefined. */
export function nextUnresolvedId(entries: MistakeEntry[], currentId: string): string | undefined {
  const idx = entries.findIndex((m) => m.id === currentId);
  const ordered = idx < 0 ? entries : [...entries.slice(idx + 1), ...entries.slice(0, idx)];
  return ordered.find((m) => m.status === 'unresolved' && m.id !== currentId)?.id;
}
