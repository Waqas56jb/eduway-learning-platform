import { getQuestion, getSubject, subjects } from '@/data';
import type { MistakeEntry } from '@/store';
import type { Localized, MistakeStatus, SubjectId } from '@/types';

export interface MistakeSection {
  key: string;
  subjectId: SubjectId;
  subjectName: Localized;
  unitTitle: Localized | null;
  data: MistakeEntry[];
}

const subjectOrder = (id: SubjectId) => {
  const i = subjects.findIndex((s) => s.id === id);
  return i < 0 ? 99 : i;
};

/** Group mistakes by subject → unit, preserving curriculum order; entries newest first. */
export function groupMistakes(entries: MistakeEntry[]): MistakeSection[] {
  const map = new Map<string, MistakeSection & { order: number }>();
  for (const entry of entries) {
    const q = getQuestion(entry.questionId);
    if (!q) continue;
    const subject = getSubject(q.subjectId);
    if (!subject) continue;
    const key = `${q.subjectId}:${q.unitId}`;
    let section = map.get(key);
    if (!section) {
      const unitIndex = subject.units.findIndex((u) => u.id === q.unitId);
      section = {
        key,
        subjectId: q.subjectId,
        subjectName: subject.name,
        unitTitle: subject.units[unitIndex]?.title ?? null,
        data: [],
        order: subjectOrder(q.subjectId) * 100 + (unitIndex < 0 ? 99 : unitIndex),
      };
      map.set(key, section);
    }
    section.data.push(entry);
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...s }) => ({
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
