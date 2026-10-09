import { create } from 'zustand';

/** State that should outlive a page change but not a restart. */
interface SessionState {
  /** Ticked ingredients per recipe, as "section-index" keys. */
  ticked: Record<string, string[]>;
  /** Where the cook got to in cook mode. */
  step: Record<string, number>;
  toggleTick(recipeId: string, key: string): void;
  clearTicks(recipeId: string): void;
  setStep(recipeId: string, step: number): void;
}

export const useSession = create<SessionState>()((set) => ({
  ticked: {},
  step: {},
  toggleTick: (recipeId, key) =>
    set((s) => {
      const current = s.ticked[recipeId] ?? [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ticked: { ...s.ticked, [recipeId]: next } };
    }),
  clearTicks: (recipeId) => set((s) => ({ ticked: { ...s.ticked, [recipeId]: [] } })),
  setStep: (recipeId, step) => set((s) => ({ step: { ...s.step, [recipeId]: step } })),
}));
