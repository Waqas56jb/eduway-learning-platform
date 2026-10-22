import { Atom, BookOpen, Calculator, Dna, FlaskConical, Globe, Languages, Microscope, Sigma, type LucideIcon, type LucideProps } from 'lucide-react';

/** Seeded subject slugs → icon. Admin-added subjects fall back to their lucide `icon` name, then a book. */
const bySlug: Record<string, LucideIcon> = { math: Sigma, physics: Atom, chemistry: FlaskConical, biology: Dna, english: Languages };
const byName: Record<string, LucideIcon> = {
  sigma: Sigma,
  atom: Atom,
  'flask-conical': FlaskConical,
  flaskconical: FlaskConical,
  dna: Dna,
  languages: Languages,
  calculator: Calculator,
  microscope: Microscope,
  globe: Globe,
  'book-open': BookOpen,
};

export function subjectIconFor(id: string | null | undefined, icon?: string | null): LucideIcon {
  return (id && bySlug[id]) || (icon && byName[icon.toLowerCase()]) || BookOpen;
}

/** `id` is the subject slug (e.g. `math`). */
export function SubjectIcon({ id, icon, ...props }: { id: string | null | undefined; icon?: string | null } & Omit<LucideProps, 'id'>) {
  const Icon = subjectIconFor(id, icon);
  return <Icon aria-hidden {...props} />;
}

/** Colored rounded tile containing the subject icon. */
export function SubjectBadgeIcon({ id, color, size = 44 }: { id: string | null | undefined; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${color}14`, color }}
    >
      <SubjectIcon id={id} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}
