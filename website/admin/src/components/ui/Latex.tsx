import { useMemo } from 'react';
import katex from 'katex';
import { cn } from '@/utils/cn';

/**
 * Renders text containing inline `$...$` and display `$$...$$` LaTeX segments.
 * Invalid LaTeX falls back to the raw source rather than throwing.
 */
export function Latex({ text, className, block }: { text: string; className?: string; block?: boolean }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    return text
      .split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g)
      .map((part) => {
        const display = part.startsWith('$$');
        if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
          const src = display ? part.slice(2, -2) : part.slice(1, -1);
          try {
            return katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html' });
          } catch {
            return esc(part);
          }
        }
        return esc(part).replace(/\n/g, '<br/>');
      })
      .join('');
  }, [text]);
  const Tag = block ? 'div' : 'span';
  return <Tag className={cn('leading-relaxed', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
