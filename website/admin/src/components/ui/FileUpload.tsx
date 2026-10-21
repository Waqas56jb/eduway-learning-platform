import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { fmtBytes } from '@/utils/format';

interface FileUploadProps {
  accept?: string;
  maxSizeMb?: number;
  /** Called with the chosen file and (for images) an object URL preview. */
  onFile: (file: File, previewUrl: string | null) => void;
  /** Existing image/preview URL to show. */
  preview?: string | null;
  onClear?: () => void;
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

/** Drag-and-drop file picker with image preview. Nothing is uploaded — files stay in the browser. */
export function FileUpload({ accept, maxSizeMb = 20, onFile, preview, onClear, label, hint, className, compact, disabled }: FileUploadProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<{ name: string; size: number } | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const handle = (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(t('common.maxSize', { size: `${maxSizeMb} MB` }));
      return;
    }
    setError(null);
    setFileName({ name: file.name, size: file.size });
    let url: string | null = null;
    if (file.type.startsWith('image/')) {
      url = URL.createObjectURL(file);
      urls.current.push(url);
    }
    onFile(file, url);
  };

  return (
    <div className={className}>
      {preview ? (
        <div className="group relative overflow-hidden rounded-xl border border-line">
          <img src={preview} alt="" className={cn('w-full object-cover', compact ? 'h-28' : 'h-44')} />
          {!disabled && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0B1F3A]/55 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button type="button" onClick={() => input.current?.click()} className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A]">
                {t('actions.upload')}
              </button>
              {onClear && (
                <button type="button" onClick={onClear} className="rounded-lg bg-white/95 p-1.5 text-danger" aria-label={t('actions.remove')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handle(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'gap-1 px-4 py-5' : 'gap-2 px-6 py-8',
            drag ? 'border-accent bg-accent/[0.06]' : 'border-line bg-surface-2 hover:border-accent/60',
          )}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent">
            <UploadCloud className="h-5 w-5" />
          </span>
          <span className="text-sm text-ink">
            {label ?? (
              <>
                {t('common.dropHere')} <span className="font-semibold text-accent underline-offset-2 hover:underline">{t('actions.browse')}</span>
              </>
            )}
          </span>
          <span className="text-xs text-muted">{hint ?? t('common.maxSize', { size: `${maxSizeMb} MB` })}</span>
          {fileName && !preview && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs text-ink ring-1 ring-line">
              <FileText className="h-3.5 w-3.5 text-muted" />
              {fileName.name} · {fmtBytes(Math.round(fileName.size / 1024))}
            </span>
          )}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
