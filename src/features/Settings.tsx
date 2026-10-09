import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { copyText, downloadText } from '../platform/device';
import { APP_VERSION, RECIPES_REPO_URL, REPO_URL, isTauri, openExternal } from '../platform/env';
import { checkForAppUpdate, type AvailableUpdate } from '../platform/updater';
import { createBackup, parseBackup } from '../store/backup';
import { useLibrary } from '../store/libraryStore';
import { useUser, userData } from '../store/userStore';
import { toast, useWide } from '../ui/hooks';
import { Button, IconButton, Segmented } from '../ui/primitives';

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-title">{title}</span>
        {hint && <span className="muted">{hint}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

function ago(time: number | null): string {
  if (!time) return 'never';
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Settings() {
  const navigate = useNavigate();
  const wide = useWide();
  const settings = useUser((s) => s.settings);
  const update = useUser((s) => s.updateSettings);
  const replaceAll = useUser((s) => s.replaceAll);
  const reset = useUser((s) => s.reset);
  const library = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);
  const [appUpdate, setAppUpdate] = useState<AvailableUpdate | null | 'checking' | 'none'>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = async () => {
    const result = await library.sync();
    if (result.status === 'failed') toast('Could not reach the recipe library. Check your connection.');
    else if (result.status === 'up-to-date') toast('Recipes are up to date');
    else if (result.status === 'unsupported') toast('Update Simmer to get the newest recipes');
  };

  const checkUpdate = async () => {
    setAppUpdate('checking');
    setAppUpdate((await checkForAppUpdate()) ?? 'none');
  };

  const backup = () => createBackup(userData(useUser.getState()));

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      toast(result.error);
      return;
    }
    replaceAll(result.data);
    toast('Backup restored');
  };

  const syncLine =
    library.syncState === 'syncing'
      ? 'Checking for new recipes…'
      : library.syncState === 'offline'
        ? `Offline. Last checked ${ago(library.lastSyncedAt)}.`
        : library.syncState === 'unsupported'
          ? 'New recipes need a newer version of Simmer.'
          : `Checked ${ago(library.lastSyncedAt)}.`;

  return (
    <div className="page settings">
      <header className="page-head">
        <div className="settings-title">
          {!wide && <IconButton icon="back" label="Back" onClick={() => navigate(-1)} />}
          <h1>Settings</h1>
        </div>
      </header>

      <section className="setting-group" aria-labelledby="set-look">
        <h2 id="set-look">Appearance</h2>
        <Row title="Theme">
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row title="Text size">
          <Segmented
            label="Text size"
            value={settings.textSize}
            onChange={(textSize) => update({ textSize })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Row>
        <Row title="Reduce motion" hint="Turns off page and sheet animations.">
          <Switch label="Reduce motion" checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
        </Row>
      </section>

      <section className="setting-group" aria-labelledby="set-cook">
        <h2 id="set-cook">Cooking</h2>
        <Row title="Measurements">
          <Segmented
            label="Measurements"
            value={settings.units}
            onChange={(units) => update({ units })}
            options={[
              { value: 'metric', label: 'Metric' },
              { value: 'us', label: 'US' },
            ]}
          />
        </Row>
        <Row title="Keep screen on in cook mode">
          <Switch label="Keep screen on in cook mode" checked={settings.keepAwake} onChange={(keepAwake) => update({ keepAwake })} />
        </Row>
        <Row title="Timer sound" hint="A short chime when a timer ends.">
          <Switch label="Timer sound" checked={settings.timerSound} onChange={(timerSound) => update({ timerSound })} />
        </Row>
      </section>

      <section className="setting-group" aria-labelledby="set-recipes">
        <h2 id="set-recipes">Recipes</h2>
        <Row
          title={`${library.recipes.length} recipes`}
          hint={
            <span data-testid="sync-status">
              {syncLine} New recipes arrive on their own.
            </span>
          }
        >
          <Button icon="refresh" onClick={() => void refresh()} disabled={library.syncState === 'syncing'}>
            Check now
          </Button>
        </Row>
        <Row title="Contribute a recipe" hint="The library is open. Anyone can add to it.">
          <Button onClick={() => void openExternal(RECIPES_REPO_URL)}>Open on GitHub</Button>
        </Row>
      </section>

      <section className="setting-group" aria-labelledby="set-data">
        <h2 id="set-data">Your data</h2>
        <p className="muted setting-note">Favourites, notes, plans and lists live only on this device. Back them up to move to another one.</p>
        <Row title="Back up">
          <Button
            onClick={() => {
              downloadText(`simmer-backup-${new Date().toISOString().slice(0, 10)}.json`, backup());
              toast('Backup saved');
            }}
          >
            Save file
          </Button>
          <Button
            onClick={async () => {
              toast((await copyText(backup())) ? 'Backup copied' : 'Could not copy the backup');
            }}
          >
            Copy
          </Button>
        </Row>
        <Row title="Restore" hint="Replaces what is on this device.">
          <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" aria-label="Backup file" onChange={(event) => void importFile(event.target.files?.[0]).then(() => (event.target.value = ''))} />
          <Button onClick={() => fileInput.current?.click()}>Choose file</Button>
        </Row>
        <Row title="Erase everything" hint="Favourites, notes, plans and lists. Settings are kept.">
          {confirmReset ? (
            <>
              <Button
                className="btn-danger"
                onClick={() => {
                  reset();
                  setConfirmReset(false);
                  toast('Your data was erased');
                }}
              >
                Erase
              </Button>
              <Button variant="plain" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmReset(true)}>Erase…</Button>
          )}
        </Row>
      </section>

      <section className="setting-group" aria-labelledby="set-about">
        <h2 id="set-about">About</h2>
        <Row
          title={`Simmer ${APP_VERSION}`}
          hint={
            appUpdate === 'checking'
              ? 'Checking…'
              : appUpdate === 'none'
                ? 'You have the latest version.'
                : appUpdate
                  ? `Version ${appUpdate.version} is available.`
                  : isTauri
                    ? 'Updates are checked when Simmer starts.'
                    : 'Running in a browser.'
          }
        >
          {appUpdate && typeof appUpdate === 'object' ? (
            <Button variant="primary" onClick={() => void (appUpdate.install ? appUpdate.install() : openExternal(appUpdate.url ?? REPO_URL))}>
              {appUpdate.install ? 'Install and restart' : 'Get the update'}
            </Button>
          ) : (
            isTauri && (
              <Button onClick={() => void checkUpdate()} disabled={appUpdate === 'checking'}>
                Check for updates
              </Button>
            )
          )}
        </Row>
        <Row title="Open source" hint="The app is AGPL-3.0. Recipes are CC BY-SA 4.0. Anything built from either must stay open too.">
          <Button onClick={() => void openExternal(REPO_URL)}>Source code</Button>
        </Row>
      </section>
    </div>
  );
}
