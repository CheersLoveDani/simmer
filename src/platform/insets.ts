/**
 * On Android the shell measures the status and navigation bars and passes them
 * in (see MainActivity.kt), because the app draws edge to edge and older
 * WebViews do not expose those sizes through CSS `env()`.
 */
declare global {
  interface Window {
    __simmerInsets?: (top: number, bottom: number) => void;
  }
}

function apply(top: number, bottom: number): void {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
  const style = document.documentElement.style;
  style.setProperty('--safe-top', `${top}px`);
  style.setProperty('--safe-bottom', `${bottom}px`);
}

export function installInsets(): void {
  const native = window.SimmerNative as { insets?: () => string } | undefined;
  if (!native?.insets) return;
  window.__simmerInsets = apply;
  const [top, bottom] = native.insets().split(',').map(Number);
  apply(top ?? 0, bottom ?? 0);
}
