import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { useClickOutside } from '@/hooks/useMisc';

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
}

/** Click-to-open floating panel anchored to its trigger. Closes on outside click and Escape. */
export function Popover({ trigger, children, align = 'end', className, panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside([root], () => setOpen(false), open);
  const close = () => setOpen(false);
  return (
    <div
      ref={root}
      className={cn('relative inline-flex', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'absolute top-full z-50 mt-2 min-w-[12rem] rounded-xl border border-line bg-surface p-1.5 shadow-lift',
              align === 'end' ? 'end-0' : 'start-0',
              panelClassName,
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  hint?: ReactNode;
}

export function MenuItem({ icon, children, onClick, danger, disabled, active, hint }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-ink/5',
        active && 'bg-accent/10 text-primary',
      )}
    >
      {icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  );
}

export const MenuDivider = () => <div className="my-1 h-px bg-line" role="separator" />;

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{children}</div>
);
