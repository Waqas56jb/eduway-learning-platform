import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Renders a single LaTeX expression with KaTeX. */
export function Formula({ tex, block, className }: { tex: string; block?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: !!block, throwOnError: false, strict: 'ignore' }),
    [tex, block],
  );
  return (
    <span
      dir="ltr"
      className={cn(block ? 'my-3 block overflow-x-auto py-1 text-center' : 'inline-block', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Inline formatting: **bold**, *italic* and $inline math$. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('$')) out.push(<Formula key={k} tex={tok.slice(1, -1)} />);
    else if (tok.startsWith('**')) out.push(<strong key={k} className="font-semibold text-primary">{inline(tok.slice(2, -2), k)}</strong>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Minimal markdown renderer for tutor answers: paragraphs, bullet / numbered lists,
 * $$display math$$, **bold**, *italic*, $inline math$.
 */
export function RichText({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => source.split(/\n{2,}/), [source]);
  return (
    <div className={cn('space-y-3 leading-relaxed', className)}>
      {blocks.map((b, bi) => {
        const trimmed = b.trim();
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
          return <Formula key={bi} tex={trimmed.slice(2, -2)} block />;
        }
        const lines = trimmed.split('\n');
        if (lines.every((ln) => /^- /.test(ln))) {
          return (
            <ul key={bi} className="list-disc space-y-1 ps-5 marker:text-accent">
              {lines.map((ln, li) => (
                <li key={li}>{inline(ln.slice(2), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((ln) => /^\d+\. /.test(ln))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 ps-5 marker:font-semibold marker:text-accent">
              {lines.map((ln, li) => (
                <li key={li}>{inline(ln.replace(/^\d+\. /, ''), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {lines.map((ln, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(ln, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
