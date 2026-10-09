import { useEffect, useRef } from 'react';

/**
 * "Back" means the same thing everywhere: close whatever is open on top of
 * the page, and only then return to the previous page. Sheets and the command
 * palette register here while open; the desktop back button, the mouse back
 * button, Alt+Left and Android's system back all go through `goBack`.
 */
const overlays: (() => void)[] = [];

/** Close the topmost open overlay. Returns false when there was none. */
export function closeTopOverlay(): boolean {
  const close = overlays.at(-1);
  if (!close) return false;
  close();
  return true;
}

export function canGoBackInHistory(): boolean {
  return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
}

/** Returns false when there was nothing to go back to. */
export function goBack(): boolean {
  if (closeTopOverlay()) return true;
  if (!canGoBackInHistory()) return false;
  window.history.back();
  return true;
}

/** While `open`, make "back" call `onClose` before anything else. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!open) return;
    const close = () => latest.current();
    overlays.push(close);
    return () => {
      const at = overlays.lastIndexOf(close);
      if (at !== -1) overlays.splice(at, 1);
    };
  }, [open]);
}

declare global {
  interface Window {
    /** Called by the Android shell on system back; true means "handled". */
    __simmerBack?: () => boolean;
  }
}

/** Wire up the ways of going back that do not have a button on screen. */
export function installBackNavigation(): () => void {
  window.__simmerBack = goBack;
  const onMouse = (event: MouseEvent) => {
    // Buttons 3 and 4 are the thumb buttons on a mouse.
    if (event.button === 3) {
      event.preventDefault();
      goBack();
    } else if (event.button === 4) {
      event.preventDefault();
      window.history.forward();
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goBack();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      window.history.forward();
    }
  };
  window.addEventListener('mouseup', onMouse);
  window.addEventListener('keydown', onKey);
  return () => {
    delete window.__simmerBack;
    window.removeEventListener('mouseup', onMouse);
    window.removeEventListener('keydown', onKey);
  };
}
