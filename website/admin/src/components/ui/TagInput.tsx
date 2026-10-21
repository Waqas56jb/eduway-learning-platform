import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Chip input: Enter or comma adds a tag, Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder, className, disabled, ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '');
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15',
        disabled && 'opacity-60',
        className,
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-accent/12 bg-accent/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-accent/25">
          {tag}
          {!disabled && (
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="text-muted hover:text-danger" aria-label={`Remove ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        disabled={disabled}
        aria-label={aria['aria-label']}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted/70"
      />
    </div>
  );
}
