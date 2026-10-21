import { Atom, Dna, FlaskConical, Languages, Sigma, type LucideProps } from 'lucide-react';
import type { SubjectId } from '@/types';

const map = { math: Sigma, physics: Atom, chemistry: FlaskConical, biology: Dna, english: Languages } as const;

export function SubjectIcon({ id, ...props }: { id: SubjectId } & LucideProps) {
  const Icon = map[id];
  return <Icon aria-hidden {...props} />;
}

/** Colored rounded tile containing the subject icon. */
export function SubjectBadgeIcon({ id, color, size = 44 }: { id: SubjectId; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${color}14`, color }}
    >
      <SubjectIcon id={id} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}
