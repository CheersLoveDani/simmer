import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { Recipe } from '../domain/schema';
import { createRecipeStore } from '../store/recipeStore';
import { feedMirrors } from '../sync/config';

export const WIDE_QUERY = '(min-width: 820px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useWide = () => useMediaQuery(WIDE_QUERY);

// ---- Toasts ----------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(message: string, action?: Toast['action']): void;
  dismiss(id: number): void;
}

let toastId = 0;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(message, action) {
    toastId += 1;
    const id = toastId;
    // Keep the stack short: the newest message matters most.
    set({ toasts: [...get().toasts.slice(-2), { id, message, action }] });
    setTimeout(() => get().dismiss(id), action ? 6000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, action?: Toast['action']) => useToasts.getState().push(message, action);

// ---- Misc ------------------------------------------------------------------

/** Run a handler for a key while the component is mounted, ignoring typing in fields. */
export function useKey(handler: (event: KeyboardEvent) => void, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}

export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

const imageStore = createRecipeStore();
const objectUrls = new Map<string, string>();

/** Object URL for a recipe's photo, fetched once and kept for offline use. */
export function useRecipeImage(recipe: Pick<Recipe, 'id' | 'image'>): string | null {
  const key = recipe.image ? `${recipe.id}:${recipe.image}` : null;
  const [url, setUrl] = useState<string | null>(key ? (objectUrls.get(key) ?? null) : null);

  useEffect(() => {
    if (!key || !recipe.image) {
      setUrl(null);
      return;
    }
    const cached = objectUrls.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    const path = recipe.image;
    void (async () => {
      try {
        let blob = await imageStore.image(recipe.id, path);
        if (!blob) {
          for (const mirror of feedMirrors()) {
            const response = await fetch(mirror + path).catch(() => null);
            if (response?.ok) {
              blob = await response.blob();
              await imageStore.saveImage(recipe.id, path, blob);
              break;
            }
          }
        }
        if (!blob || cancelled) return;
        const created = URL.createObjectURL(blob);
        objectUrls.set(key, created);
        setUrl(created);
      } catch {
        // The generated cover stays in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, recipe.id, recipe.image]);

  return url;
}
