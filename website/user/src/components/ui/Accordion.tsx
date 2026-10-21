import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AccordionItemProps {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  /** Extra content shown on the right of the header (badges, counts). */
  meta?: ReactNode;
}

export function AccordionItem({ open, onToggle, title, children, className, headerClassName, meta }: AccordionItemProps) {
  const id = useId();
  return (
    <div className={cn('overflow-hidden', className)}>
      <h3 className="font-sans tracking-normal">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          onClick={onToggle}
          className={cn('flex w-full items-center justify-between gap-4 text-start', headerClassName)}
        >
          <span className="min-w-0 flex-1">{title}</span>
          {meta}
          <ChevronDown
            className={cn('h-5 w-5 shrink-0 text-accent transition-transform duration-300', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-btn`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
