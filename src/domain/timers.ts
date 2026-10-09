export interface Timer {
  id: string;
  label: string;
  recipeId?: string;
  durationMs: number;
  status: 'running' | 'paused' | 'done';
  /** Epoch ms the timer finishes; meaningful while running. */
  endsAt: number;
  /** Time left; meaningful while paused. */
  remainingMs: number;
}

export type TimerAction =
  | { type: 'start'; id: string; label: string; minutes: number; now: number; recipeId?: string }
  | { type: 'pause'; id: string; now: number }
  | { type: 'resume'; id: string; now: number }
  | { type: 'add'; id: string; minutes: number; now: number }
  | { type: 'dismiss'; id: string }
  | { type: 'tick'; now: number };

export function remaining(timer: Timer, now: number): number {
  if (timer.status === 'done') return 0;
  if (timer.status === 'paused') return timer.remainingMs;
  return Math.max(0, timer.endsAt - now);
}

export function timersReducer(timers: Timer[], action: TimerAction): Timer[] {
  switch (action.type) {
    case 'start': {
      const durationMs = Math.round(action.minutes * 60_000);
      if (!(durationMs > 0)) return timers;
      const timer: Timer = {
        id: action.id,
        label: action.label,
        recipeId: action.recipeId,
        durationMs,
        status: 'running',
        endsAt: action.now + durationMs,
        remainingMs: durationMs,
      };
      return [...timers.filter((t) => t.id !== action.id), timer];
    }
    case 'pause':
      return timers.map((t) =>
        t.id === action.id && t.status === 'running'
          ? { ...t, status: 'paused', remainingMs: remaining(t, action.now) }
          : t,
      );
    case 'resume':
      return timers.map((t) =>
        t.id === action.id && t.status === 'paused'
          ? { ...t, status: 'running', endsAt: action.now + t.remainingMs }
          : t,
      );
    case 'add': {
      const extra = Math.round(action.minutes * 60_000);
      return timers.map((t) => {
        if (t.id !== action.id) return t;
        if (t.status === 'paused') return { ...t, remainingMs: t.remainingMs + extra, durationMs: t.durationMs + extra };
        // Adding time to a finished timer restarts it for that long.
        const base = t.status === 'done' ? action.now : t.endsAt;
        return { ...t, status: 'running', endsAt: base + extra, durationMs: t.durationMs + extra };
      });
    }
    case 'dismiss':
      return timers.filter((t) => t.id !== action.id);
    case 'tick': {
      let changed = false;
      const next = timers.map((t) => {
        if (t.status === 'running' && t.endsAt <= action.now) {
          changed = true;
          return { ...t, status: 'done' as const, remainingMs: 0 };
        }
        return t;
      });
      return changed ? next : timers;
    }
  }
}

/** Ids of timers that finish between two states, for firing an alert once. */
export function newlyDone(before: Timer[], after: Timer[]): Timer[] {
  const wasDone = new Set(before.filter((t) => t.status === 'done').map((t) => t.id));
  return after.filter((t) => t.status === 'done' && !wasDone.has(t.id));
}

/** 65000 -> "1:05", 3723000 -> "1:02:03". Rounds up so a timer never shows 0:00 early. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function progress(timer: Timer, now: number): number {
  if (timer.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining(timer, now) / timer.durationMs));
}

export interface AlertPlan {
  /** Timers whose alert must be (re)scheduled for their current end time. */
  schedule: Timer[];
  /** Ids whose previously scheduled alert no longer applies. */
  cancel: string[];
  /** What is scheduled after applying the plan: timer id -> end time. */
  scheduled: Map<string, number>;
}

/**
 * Work out which system alerts to set and which to withdraw so that exactly
 * the running timers have one, at the time each will finish. A timer that
 * has finished keeps its alert: it is being shown, not withdrawn.
 */
export function planAlerts(scheduled: ReadonlyMap<string, number>, timers: Timer[]): AlertPlan {
  const next = new Map<string, number>();
  const schedule: Timer[] = [];
  const cancel: string[] = [];
  const byId = new Map(timers.map((t) => [t.id, t]));
  for (const timer of timers) {
    if (timer.status !== 'running') continue;
    next.set(timer.id, timer.endsAt);
    const had = scheduled.get(timer.id);
    if (had === timer.endsAt) continue;
    if (had !== undefined) cancel.push(timer.id);
    schedule.push(timer);
  }
  for (const id of scheduled.keys()) {
    if (next.has(id)) continue;
    if (byId.get(id)?.status !== 'done') cancel.push(id);
  }
  return { schedule, cancel, scheduled: next };
}
