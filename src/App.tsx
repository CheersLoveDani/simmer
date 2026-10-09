import { MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, RouterProvider, ScrollRestoration, createHashRouter, useLocation, useNavigate } from 'react-router';
import { CommandPalette } from './features/CommandPalette';
import { CookMode } from './features/CookMode';
import { Home } from './features/Home';
import { Planner } from './features/Planner';
import { Recipe } from './features/Recipe';
import { Saved } from './features/Saved';
import { Search } from './features/Search';
import { Settings } from './features/Settings';
import { Shopping } from './features/Shopping';
import { TimerDock, useTimerEngine, useTimerSheet } from './features/timers';
import { applyNativeTheme } from './platform/device';
import { isAndroid } from './platform/env';
import { appUpdater, type UpdateState } from './platform/updater';
import { SYNC_INTERVAL_MS, useLibrary } from './store/libraryStore';
import { useTimers } from './store/timerStore';
import { useUser } from './store/userStore';
import { Icon, type IconName } from './ui/Icon';
import { canGoBackInHistory, goBack, installBackNavigation } from './ui/back';
import { toast, useMediaQuery, useWide } from './ui/hooks';
import { Toasts } from './ui/primitives';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/plan', label: 'Plan', icon: 'calendar' },
  { to: '/shopping', label: 'Shopping', icon: 'basket' },
  { to: '/saved', label: 'Saved', icon: 'heart' },
];

/** Reflect appearance settings onto the document, where the CSS reads them. */
function useAppearance() {
  const settings = useUser((s) => s.settings);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.text = settings.textSize;
    if (settings.reduceMotion) root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
  }, [dark, settings.textSize, settings.reduceMotion]);

  useEffect(() => {
    void applyNativeTheme(settings.theme, dark);
  }, [settings.theme, dark]);

  return settings.reduceMotion;
}

/** Keep recipes fresh: on a timer, when the app returns to view, and when the network comes back. */
function useAutoSync() {
  useEffect(() => {
    const sync = () => void useLibrary.getState().sync();
    const stale = () => {
      const { lastSyncedAt, status } = useLibrary.getState();
      return status === 'ready' && (!lastSyncedAt || Date.now() - lastSyncedAt > SYNC_INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stale()) sync();
    };
    const interval = setInterval(() => stale() && sync(), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', sync);
    };
  }, []);
}

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** An update must never restart the app under someone who is cooking. */
function quietMoment(): boolean {
  const cooking = window.location.hash.endsWith('/cook');
  const timing = useTimers.getState().timers.some((timer) => timer.status !== 'done');
  return !cooking && !timing;
}

/**
 * Keep the app itself up to date: look for a new version at launch and every
 * few hours. Returns the version being installed while the app is about to
 * restart, so the screen can say so.
 */
function useAppUpdates(): string | null {
  const [state, setState] = useState<UpdateState>(appUpdater.getState());

  useEffect(() => {
    const stop = appUpdater.subscribe((next) => {
      setState(next);
      if (next.status !== 'ready' || !next.version) return;
      toast(`Simmer ${next.version} is ready`, { label: isAndroid ? 'Install' : 'Restart to update', run: () => void appUpdater.install() });
    });
    const check = () => {
      const { autoUpdate } = useUser.getState().settings;
      void appUpdater.check({ auto: autoUpdate, mayRestart: quietMoment }).then(() => {
        const { status, version } = appUpdater.getState();
        if (status === 'available' && version) toast(`Simmer ${version} is available`, { label: 'Update', run: () => void appUpdater.install() });
      });
    };
    check();
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      stop();
      clearInterval(interval);
    };
  }, []);

  // Android's installer is a separate screen; only desktop restarts in place.
  return state.status === 'installing' && !isAndroid ? state.version : null;
}

function Root() {
  const reduceMotion = useAppearance();
  const notice = useLibrary((s) => s.notice);
  const dismissNotice = useLibrary((s) => s.dismissNotice);
  useTimerEngine();
  useAutoSync();
  useEffect(installBackNavigation, []);

  useEffect(() => {
    if (!notice) return;
    toast(`Recipes updated: ${notice}`);
    dismissNotice();
  }, [notice, dismissNotice]);

  const updating = useAppUpdates();

  if (updating) {
    return (
      <div className="splash" role="status">
        <img src="/icon.svg" alt="" width="72" height="72" />
        <p>Updating to Simmer {updating}…</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <Outlet />
      <TimerDock />
      <Toasts />
      <CommandPalette />
      <ScrollRestoration />
    </MotionConfig>
  );
}

function Shell() {
  const wide = useWide();
  const navigate = useNavigate();
  const openTimers = useTimerSheet((s) => s.setOpen);
  const syncing = useLibrary((s) => s.syncState === 'syncing');
  // Read on every navigation: the history position changes with the location.
  useLocation();
  const canGoBack = canGoBackInHistory();

  return (
    <div className={`shell ${wide ? 'is-wide' : 'is-narrow'}`}>
      {wide ? (
        <nav className="rail no-print" aria-label="Main">
          <button type="button" className="rail-brand" onClick={() => navigate('/')} aria-label="Simmer home">
            <img src="/icon.svg" alt="" width="40" height="40" />
          </button>
          <button type="button" className="rail-back" onClick={goBack} disabled={!canGoBack} aria-label="Back" title="Back (Alt+Left)">
            <Icon name="back" />
          </button>
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="rail-link" viewTransition>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="rail-foot">
            <button type="button" className="rail-link" onClick={() => openTimers(true)}>
              <Icon name="timer" />
              <span>Timers</span>
            </button>
            <NavLink to="/settings" className="rail-link">
              <Icon name="settings" className={syncing ? 'is-spinning' : ''} />
              <span>Settings</span>
            </NavLink>
          </div>
        </nav>
      ) : (
        <nav className="tabbar no-print" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="tab">
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Nothing here</h1>
      <p className="muted">That page does not exist.</p>
    </div>
  );
}

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/search', element: <Search /> },
          { path: '/recipe/:id', element: <Recipe /> },
          { path: '/plan', element: <Planner /> },
          { path: '/shopping', element: <Shopping /> },
          { path: '/saved', element: <Saved /> },
          { path: '/settings', element: <Settings /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '/recipe/:id/cook', element: <CookMode /> },
    ],
  },
]);

export function App() {
  const ready = useLibrary((s) => s.status === 'ready');
  const [hydrated, setHydrated] = useState(useUser.persist.hasHydrated());

  useEffect(() => {
    const stop = useUser.persist.onFinishHydration(() => setHydrated(true));
    if (useUser.persist.hasHydrated()) setHydrated(true);
    void useLibrary.getState().init();
    return stop;
  }, []);

  if (!ready || !hydrated) {
    return (
      <div className="splash" role="status" aria-label="Loading Simmer">
        <img src="/icon.svg" alt="" width="72" height="72" />
      </div>
    );
  }
  return <RouterProvider router={router} />;
}
