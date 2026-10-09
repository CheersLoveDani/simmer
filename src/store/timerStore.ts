import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newlyDone, timersReducer, type Timer, type TimerAction } from '../domain/timers';

interface TimerState {
  timers: Timer[];
  /** Updated by the ticker so views re-render as time passes. */
  now: number;
  dispatch(action: TimerAction): Timer[];
  start(input: { id: string; label: string; minutes: number; recipeId?: string }): void;
}

type DoneListener = (timer: Timer) => void;
const listeners = new Set<DoneListener>();

/** Called once per timer when it finishes. Returns an unsubscribe function. */
export function onTimerDone(listener: DoneListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useTimers = create<TimerState>()(
  persist(
    (set, get) => ({
      timers: [],
      now: Date.now(),
      dispatch(action) {
        const before = get().timers;
        const after = timersReducer(before, action);
        const now = 'now' in action ? action.now : get().now;
        if (after !== before || now !== get().now) set({ timers: after, now });
        for (const timer of newlyDone(before, after)) listeners.forEach((listener) => listener(timer));
        return after;
      },
      start({ id, label, minutes, recipeId }) {
        get().dispatch({ type: 'start', id, label, minutes, recipeId, now: Date.now() });
      },
    }),
    // Timers hold absolute end times, so they survive a reload or restart.
    { name: 'simmer.timers', partialize: (state) => ({ timers: state.timers }) },
  ),
);
