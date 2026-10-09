import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useKey, useToasts, useWide } from './hooks';

// ---- Buttons ---------------------------------------------------------------

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet' | 'plain';
  icon?: IconName;
}

export function Button({ variant = 'quiet', icon, children, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  filled?: boolean;
  active?: boolean;
}

export function IconButton({ icon, label, filled, active, className = '', ...rest }: IconButtonProps) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} filled={filled} />
    </button>
  );
}

// ---- Chips and segmented controls ------------------------------------------

interface ChipProps {
  selected: boolean;
  onToggle(): void;
  children: ReactNode;
  count?: number;
}

export function Chip({ selected, onToggle, children, count }: ChipProps) {
  return (
    <button type="button" className={`chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onToggle}>
      {children}
      {count != null && <span className="chip-count">{count}</span>}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`segment ${selected ? 'is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {selected && <motion.span layoutId={`segment-${id}`} className="segment-thumb" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="segment-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Stepper ---------------------------------------------------------------

interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange(value: number): void;
  format?(value: number): string;
}

export function Stepper({ label, value, min = 1, max = 48, onChange, format }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-btn" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon name="minus" size={18} />
      </button>
      <output className="stepper-value tabular" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.14 }}>
            {format ? format(value) : value}
          </motion.span>
        </AnimatePresence>
      </output>
      <button type="button" className="stepper-btn" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

// ---- Stars -----------------------------------------------------------------

export function Stars({ value, onChange }: { value: number; onChange(value: number): void }) {
  return (
    <div className="stars" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star ${star <= value ? 'is-on' : ''}`}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={star === value}
          onClick={() => onChange(star)}
        >
          <Icon name="star" filled={star <= value} size={24} />
        </button>
      ))}
    </div>
  );
}

// ---- Sheet -----------------------------------------------------------------

interface SheetProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}

/** A bottom sheet on narrow screens, a centred dialog on wide ones. */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const wide = useWide();
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useKey((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }, open);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className={`sheet-layer ${wide ? 'is-wide' : ''}`}>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
          <motion.div
            ref={panel}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={wide ? { opacity: 0, scale: 0.97, y: 8 } : { y: '100%' }}
            animate={wide ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={wide ? { opacity: 0, scale: 0.98, y: 4 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag={wide ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="sheet-head" onPointerDown={(event) => !wide && drag.start(event)}>
              {!wide && <span className="sheet-grip" aria-hidden="true" />}
              <h2 id={titleId}>{title}</h2>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
            <div className="sheet-body">{children}</div>
            {footer && <div className="sheet-foot">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---- Toasts ----------------------------------------------------------------

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            className="toast"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          >
            <span>{item.message}</span>
            {item.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  item.action?.run();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---- Empty state -----------------------------------------------------------

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h2>{title}</h2>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, children, lead }: { title: string; children?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="page-lead muted">{lead}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
