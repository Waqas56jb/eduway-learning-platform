import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RichText } from '@/components/ui/MathText';
import { plainPreview } from './tutorEngine';

const CHARS_PER_TICK = 4;
const TICK_MS = 22;

/**
 * Reveals an answer progressively. Finished blocks render as RichText (with KaTeX);
 * the block currently "typing" is shown as plain text so partial LaTeX never renders broken.
 * `live`: the source is still growing (SSE deltas) — wait at the end instead of finishing.
 */
export function StreamingAnswer({ source, onDone, live = false }: { source: string; onDone: () => void; live?: boolean }) {
  const reduce = useReducedMotion();
  const blocks = useMemo(() => source.split(/\n{2,}/), [source]);
  const [pos, setPos] = useState({ block: 0, chars: 0 });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!live && (reduce || pos.block >= blocks.length)) {
      doneRef.current();
      return;
    }
    // While streaming, the last block may still grow: never step past it.
    const lastIdx = blocks.length - 1;
    if (live && pos.block >= lastIdx && pos.chars >= (blocks[lastIdx] ?? '').trim().length) {
      if (pos.block > lastIdx) setPos({ block: Math.max(0, lastIdx), chars: (blocks[lastIdx] ?? '').trim().length });
      return;
    }
    const t = window.setTimeout(() => {
      setPos(({ block, chars }) => {
        const current = (blocks[block] ?? '').trim();
        const isLast = block >= blocks.length - 1;
        // Display formulas appear in one go (once complete); text blocks type out.
        if (current.startsWith('$$') && (!live || !isLast || current.endsWith('$$'))) return { block: block + 1, chars: 0 };
        const next = chars + CHARS_PER_TICK;
        if (next >= current.length) return live && isLast ? { block, chars: current.length } : { block: block + 1, chars: 0 };
        return { block, chars: next };
      });
    }, TICK_MS);
    return () => window.clearTimeout(t);
  }, [pos, blocks, reduce, live]);

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
