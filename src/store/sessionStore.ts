import { create } from 'zustand';
import type { Split } from '../domain/mealprep';

/** What a cook is for, chosen before cook mode starts. */
export interface CookPlan {
  mode: 'now' | 'prep';
  /** Portions cooked in all. */
  total: number;
  split: Split;
}

/** State that should outlive a page change but not a restart. */
interface SessionState {
  /** Ticked ingredients per recipe, as "section-index" keys. */
  ticked: Record<string, string[]>;
  /** Where the cook got to in cook mode. */
  step: Record<string, number>;
  toggleTick(recipeId: string, key: string): void;
  clearTicks(recipeId: string): void;
  setStep(recipeId: string, step: number): void;
  /** How the current cook of each recipe will be eaten. */
  cookPlan: Record<string, CookPlan>;
  setCookPlan(recipeId: string, plan: CookPlan | null): void;
}

export const useSession = create<SessionState>()((set) => ({
  ticked: {},
  step: {},
  cookPlan: {},
  toggleTick: (recipeId, key) =>
    set((s) => {
      const current = s.ticked[recipeId] ?? [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ticked: { ...s.ticked, [recipeId]: next } };
    }),
  clearTicks: (recipeId) => set((s) => ({ ticked: { ...s.ticked, [recipeId]: [] } })),
  setStep: (recipeId, step) => set((s) => ({ step: { ...s.step, [recipeId]: step } })),
  setCookPlan: (recipeId, plan) =>
    set((s) => {
      const { [recipeId]: _old, ...rest } = s.cookPlan;
      return { cookPlan: plan ? { ...rest, [recipeId]: plan } : rest };
    }),
}));
