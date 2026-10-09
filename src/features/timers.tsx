import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { create } from 'zustand';
import { formatMinutes } from '../domain/quantity';
import { formatClock, progress, remaining, type Timer } from '../domain/timers';
import { notify, playChime, prepareNotifications, vibrate } from '../platform/device';
import { useLibrary } from '../store/libraryStore';
import { onTimerDone, useTimers } from '../store/timerStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/hooks';
import { Button, IconButton, Sheet } from '../ui/primitives';

/** Drives every timer: ticks while any is running and raises the alert when one ends. */
export function useTimerEngine(): void {
  const running = useTimers((s) => s.timers.some((t) => t.status === 'running'));

  // Subscribed before the first tick, so a timer that ended while the app was
  // closed still raises its alert.
  useEffect(
    () =>
      onTimerDone((timer) => {
        if (useUser.getState().settings.timerSound) playChime();
        vibrate([200, 100, 200, 100, 400]);
        void notify(`${timer.label} is done`, 'Your timer has finished.');
        toast(`${timer.label} is done`, {
          label: 'Dismiss',
          run: () => useTimers.getState().dispatch({ type: 'dismiss', id: timer.id }),
        });
      }),
    [],
  );

  useEffect(() => {
    // Catch up straight away: a timer may have ended while the app was closed.
    useTimers.getState().dispatch({ type: 'tick', now: Date.now() });
    if (!running) return;
    const interval = setInterval(() => useTimers.getState().dispatch({ type: 'tick', now: Date.now() }), 250);
    return () => clearInterval(interval);
  }, [running]);
}

export function startTimer(input: { id: string; label: string; minutes: number; recipeId?: string }): void {
  void prepareNotifications();
  useTimers.getState().start(input);
}

function Ring({ value, size = 22 }: { value: number; size?: number }) {
  const r = 9;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="ring-track" />
      <circle cx="12" cy="12" r={r} className="ring-value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value)} transform="rotate(-90 12 12)" />
    </svg>
  );
}

/** The timer control shown beside a recipe step. */
export function StepTimer({ id, label, minutes, recipeId, large = false }: { id: string; label: string; minutes: number; recipeId: string; large?: boolean }) {
  const timer = useTimers((s) => s.timers.find((t) => t.id === id));
  const now = useTimers((s) => s.now);
  const dispatch = useTimers((s) => s.dispatch);
  const className = `step-timer ${large ? 'is-large' : ''}`;

  if (!timer) {
    return (
      <button type="button" className={className} onClick={() => startTimer({ id, label, minutes, recipeId })}>
        <Icon name="timer" size={18} />
        Start {formatMinutes(minutes)} timer
      </button>
    );
  }
  if (timer.status === 'done') {
    return (
      <button type="button" className={`${className} is-done`} onClick={() => dispatch({ type: 'dismiss', id })}>
        <Icon name="check" size={18} />
        {label} done. Dismiss
      </button>
    );
  }
  const paused = timer.status === 'paused';
  return (
    <button
      type="button"
      className={`${className} is-running`}
      aria-label={`${label} timer, ${formatClock(remaining(timer, now))} left. ${paused ? 'Resume' : 'Pause'}`}
      onClick={() => dispatch({ type: paused ? 'resume' : 'pause', id, now: Date.now() })}
    >
      <Ring value={progress(timer, now)} />
      <span className="tabular">{formatClock(remaining(timer, now))}</span>
      <span className="muted">{paused ? 'Paused' : label}</span>
    </button>
  );
}

function TimerRow({ timer }: { timer: Timer }) {
  const now = useTimers((s) => s.now);
  const dispatch = useTimers((s) => s.dispatch);
  const recipe = useLibrary((s) => (timer.recipeId ? s.byId.get(timer.recipeId) : undefined));
  const done = timer.status === 'done';
  return (
    <motion.li layout className={`timer-row ${done ? 'is-done' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
      <Ring value={progress(timer, now)} size={44} />
      <div className="timer-row-text">
        <span className="timer-clock tabular">{done ? 'Done' : formatClock(remaining(timer, now))}</span>
        <span className="muted">
          {timer.label}
          {recipe ? `, ${recipe.title}` : ''}
        </span>
      </div>
      <div className="timer-row-actions">
        <IconButton icon="plus" label={`Add a minute to ${timer.label}`} onClick={() => dispatch({ type: 'add', id: timer.id, minutes: 1, now: Date.now() })} />
        {!done && (
          <IconButton
            icon={timer.status === 'paused' ? 'play' : 'pause'}
            label={`${timer.status === 'paused' ? 'Resume' : 'Pause'} ${timer.label}`}
            onClick={() => dispatch({ type: timer.status === 'paused' ? 'resume' : 'pause', id: timer.id, now: Date.now() })}
          />
        )}
        <IconButton icon="close" label={`Remove ${timer.label}`} onClick={() => dispatch({ type: 'dismiss', id: timer.id })} />
      </div>
    </motion.li>
  );
}

const PRESETS = [1, 3, 5, 10, 15, 30];

/** Lets any screen open the timer list. */
export const useTimerSheet = create<{ open: boolean; setOpen(open: boolean): void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Floating pill with the next timer to finish; opens the full list. */
export function TimerDock() {
  const timers = useTimers((s) => s.timers);
  const now = useTimers((s) => s.now);
  const open = useTimerSheet((s) => s.open);
  const setOpen = useTimerSheet((s) => s.setOpen);

  const active = timers.filter((t) => t.status !== 'done');
  const done = timers.filter((t) => t.status === 'done');
  const next = [...active].sort((a, b) => remaining(a, now) - remaining(b, now))[0];
  const visible = timers.length > 0;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            className={`timer-dock no-print ${done.length ? 'has-done' : ''}`}
            data-testid="timer-dock"
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            onClick={() => setOpen(true)}
            aria-label={`Timers: ${active.length} running, ${done.length} finished`}
          >
            {done.length > 0 ? <Icon name="check" size={20} /> : next && <Ring value={progress(next, now)} />}
            <span className="tabular">{done.length > 0 ? `${done[0]!.label} done` : next ? formatClock(remaining(next, now)) : ''}</span>
            {timers.length > 1 && <span className="badge">{timers.length}</span>}
          </motion.button>
        )}
      </AnimatePresence>
      <Sheet open={open} title="Timers" onClose={() => setOpen(false)}>
        <ul className="timer-list">
          <AnimatePresence initial={false}>
            {[...done, ...active].map((timer) => (
              <TimerRow key={timer.id} timer={timer} />
            ))}
          </AnimatePresence>
        </ul>
        {timers.length === 0 && <p className="muted">No timers running.</p>}
        <div className="filter-group">
          <p className="sheet-label">Start a kitchen timer</p>
          <div className="chip-wrap">
            {PRESETS.map((minutes) => (
              <Button key={minutes} onClick={() => startTimer({ id: `quick-${Date.now()}`, label: `${minutes} min timer`, minutes })}>
                {minutes} min
              </Button>
            ))}
          </div>
        </div>
      </Sheet>
    </>
  );
}
