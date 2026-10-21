import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RichText } from '@/components/ui/MathText';
import { plainPreview } from './tutorEngine';

const CHARS_PER_TICK = 4;
const TICK_MS = 22;

/**
 * Reveals an answer progressively. Finished blocks render as RichText (with KaTeX);
 * the block currently "typing" is shown as plain text so partial LaTeX never renders broken.
 */
export function StreamingAnswer({ source, onDone }: { source: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const blocks = useMemo(() => source.split(/\n{2,}/), [source]);
  const [pos, setPos] = useState({ block: 0, chars: 0 });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (reduce || pos.block >= blocks.length) {
      doneRef.current();
      return;
    }
    const t = window.setTimeout(() => {
      setPos(({ block, chars }) => {
        const current = blocks[block].trim();
        // Display formulas appear in one go; text blocks type out.
        if (current.startsWith('$$')) return { block: block + 1, chars: 0 };
        const next = chars + CHARS_PER_TICK;
        return next >= current.length ? { block: block + 1, chars: 0 } : { block, chars: next };
      });
    }, TICK_MS);
    return () => window.clearTimeout(t);
  }, [pos, blocks, reduce]);

  const done = blocks.slice(0, pos.block).join('\n\n');
  const typing = pos.block < blocks.length ? plainPreview(blocks[pos.block].slice(0, pos.chars)) : '';

  return (
    <div className="space-y-3">
      {done && <RichText source={done} />}
      {pos.block < blocks.length && (
        <p className="whitespace-pre-line leading-relaxed">
          {typing}
          <span className="ms-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-accent" aria-hidden />
        </p>
      )}
    </div>
  );
}
