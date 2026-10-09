import { isAndroid, isDesktopApp, isTauri } from './env';

// ---- Sharing ---------------------------------------------------------------

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** Share through the system sheet where there is one, otherwise copy. */
export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  if (window.SimmerNative?.share) {
    window.SimmerNative.share(title, text);
    return 'shared';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Keeping the screen on while cooking -----------------------------------

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
    sentinel?.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Refused (battery saver, unsupported): cooking still works, the screen may dim.
  }
}

if (typeof document !== 'undefined') {
  // The lock is dropped whenever the page is hidden; take it again on return.
  document.addEventListener('visibilitychange', () => void acquire());
}

export function setKeepAwake(on: boolean): void {
  wanted = on;
  if (window.SimmerNative?.setKeepAwake) {
    window.SimmerNative.setKeepAwake(on);
    return;
  }
  if (on) void acquire();
  else {
    void sentinel?.release();
    sentinel = null;
  }
}

// ---- Timer alerts ----------------------------------------------------------

let audio: AudioContext | null = null;

/** A soft three-note chime, synthesised so no audio file ships with the app. */
export function playChime(): void {
  try {
    audio ??= new AudioContext();
    const context = audio;
    void context.resume();
    const start = context.currentTime + 0.02;
    [659.25, 783.99, 1046.5].forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + i * 0.18;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.22, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 1);
    });
  } catch {
    // No audio device or autoplay blocked; the on-screen alert still shows.
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported
  }
}

async function tauriNotificationsAllowed(): Promise<boolean> {
  const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

/** Ask once, when the first timer is started, so the prompt has context. */
export async function prepareNotifications(): Promise<void> {
  try {
    if (isTauri) await tauriNotificationsAllowed();
    else if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    // Declined or unavailable: timers still alert inside the app.
  }
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isTauri) {
      if (!(await tauriNotificationsAllowed())) return;
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body });
    } else if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(title, { body });
    }
  } catch {
    // Best effort only.
  }
}

/**
 * On Android the page stops running when the screen is off, so a timer's alert
 * is handed to the system to deliver at the right moment.
 */
export const canScheduleNotifications = isTauri && isAndroid;

export async function scheduleNotification(id: number, title: string, body: string, at: Date): Promise<void> {
  try {
    if (!(await tauriNotificationsAllowed())) return;
    const { sendNotification, Schedule } = await import('@tauri-apps/plugin-notification');
    sendNotification({ id, title, body, schedule: Schedule.at(at, false, true) });
  } catch {
    // The in-app alert still fires when the app is next opened.
  }
}

export async function cancelNotification(id: number): Promise<void> {
  try {
    const { cancel } = await import('@tauri-apps/plugin-notification');
    await cancel([id]);
  } catch {
    // Nothing was scheduled, or it has already been shown.
  }
}

// ---- Native chrome ---------------------------------------------------------

/**
 * Make the parts of the window the page does not draw match the app's theme:
 * the title bar on desktop, the status and navigation bar icons on Android.
 * "system" hands the title bar back to the operating system.
 */
export async function applyNativeTheme(choice: 'system' | 'light' | 'dark', dark: boolean): Promise<void> {
  try {
    window.SimmerNative?.setDarkChrome?.(dark);
    if (isDesktopApp) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTheme(choice === 'system' ? null : choice);
    }
  } catch {
    // Cosmetic only.
  }
}
