import { useRef, useState } from 'react';
import { Icon, Seg, Toggle, toast } from './ui';
import { store, useStore } from '../lib/store';
import { configBakedIn, resetClient, signIn, signOut, supabaseConfig, syncNow } from '../lib/sync';
import type { Entry, Person, Tracking } from '../lib/types';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TARGETS: { key: keyof Omit<Tracking, 'on'>; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
];

export function SettingsView() {
  const { settings, device, sync } = useStore();
  const [names, setNames] = useState(settings.names);
  const [url, setUrl] = useState(device.supabaseUrl ?? '');
  const [key, setKey] = useState(device.supabaseKey ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const backupRef = useRef<HTMLInputElement>(null);
  const configured = Boolean(supabaseConfig());

  const saveNames = () => {
    const clean = { tom: names.tom.trim() || 'Tom', nuria: names.nuria.trim() || 'Nuria' };
    if (clean.tom !== settings.names.tom || clean.nuria !== settings.names.nuria) {
      store.updateSettings({ names: clean });
      toast('Names updated');
    }
  };

  const setTracking = (p: Person, patch: Partial<Tracking>) =>
    store.updateSettings({ tracking: { ...settings.tracking, [p]: { ...settings.tracking[p], ...patch } } });

  const doSignIn = async () => {
    setBusy(true);
    try {
      await signIn(email, password);
      setPassword('');
      toast('Signed in — syncing');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = () => {
    resetClient();
    store.setDevice({ supabaseUrl: url.trim(), supabaseKey: key.trim() });
    void syncNow();
    toast('Saved');
  };

  const importBackup = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as { app?: string; entries: Entry[] };
      if (!Array.isArray(data.entries) || data.app !== 'mealplanner') throw new Error();
      store.importEntries(data.entries);
      toast(`Restored ${data.entries.length} items`);
    } catch {
      toast('That file isn’t a Meal Planner backup');
    }
  };

  const syncLabel: Record<typeof sync.state, string> = {
    local: 'Not connected — data is only on this phone',
    'signed-out': 'Connected to Supabase — sign in to sync',
    syncing: 'Syncing…',
    synced: `Synced${sync.lastSynced ? ` at ${new Date(sync.lastSynced).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
    offline: 'Offline — changes will sync when you’re back online',
    error: `Sync problem: ${sync.message ?? 'unknown error'}`,
  };

  return (
    <>
      <div className="section-title" style={{ marginTop: 6 }}>This phone belongs to</div>
      <Seg<Person>
        value={device.me}
        onChange={(me) => store.setDevice({ me, view: me })}
        options={[
          { value: 'tom', label: settings.names.tom, className: 'tom' },
          { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
        ]}
      />
      <p className="small-print">The app opens on this person’s view, and new recipes are theirs unless you choose otherwise.</p>

      <div className="section-title">Nutrition tracking</div>
      <div className="card set-group">
        {(['tom', 'nuria'] as const).map((p) => {
          const t = settings.tracking[p];
          return (
            <div key={p} className="set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <div className="toggle-row">
                <span>
                  <strong className={p}>{settings.names[p]}</strong>
                  <div className="hint">{t.on ? 'Sees calories and macros' : 'No numbers shown'}</div>
                </span>
                <Toggle checked={t.on} onChange={(on) => setTracking(p, { on })} label={`Nutrition tracking for ${settings.names[p]}`} />
              </div>
              {t.on && (
                <div className="targets">
                  {TARGETS.map((x) => (
                    <label key={x.key}>
                      <span>{x.label}</span>
                      <span className="target-in">
                        <input
                          className="input num"
                          inputMode="numeric"
                          value={t[x.key] ?? ''}
                          placeholder="–"
                          onChange={(e) => setTracking(p, { [x.key]: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined })}
                          aria-label={`${settings.names[p]} daily ${x.label}`}
                        />
                        <small>{x.unit}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="small-print">Optional, per person. Daily targets are used by the calendar, coming in the next phase.</p>

      <div className="section-title">Names</div>
      <div className="card set-group">
        <div className="set-row">
          <span className="tom" style={{ fontWeight: 650, width: 76, whiteSpace: 'nowrap' }}>Person 1</span>
          <input className="input grow" value={names.tom} onChange={(e) => setNames({ ...names, tom: e.target.value })} onBlur={saveNames} aria-label="Person 1 name" />
        </div>
        <div className="set-row">
          <span className="nuria" style={{ fontWeight: 650, width: 76, whiteSpace: 'nowrap' }}>Person 2</span>
          <input className="input grow" value={names.nuria} onChange={(e) => setNames({ ...names, nuria: e.target.value })} onBlur={saveNames} aria-label="Person 2 name" />
        </div>
      </div>

      <div className="section-title">Sync between phones</div>
      <div className="card pad">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <span className={`dot ${sync.state === 'synced' ? 'ok' : sync.state === 'syncing' ? 'busy' : sync.state === 'error' ? 'bad' : 'warn'}`} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{syncLabel[sync.state]}</span>
        </div>

        {!configBakedIn() && (!configured || sync.state === 'local' || sync.state === 'signed-out') && (
          <>
            <div className="field">
              <label htmlFor="sburl">Supabase project URL</label>
              <input id="sburl" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="off" autoCorrect="off" />
            </div>
            <div className="field">
              <label htmlFor="sbkey">Supabase publishable key</label>
              <input id="sbkey" className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" autoCapitalize="off" autoCorrect="off" />
            </div>
            <button className="btn" onClick={saveConfig} disabled={!url || !key} style={{ marginBottom: configured ? 18 : 0 }}>
              Save connection
            </button>
          </>
        )}

        {configured && !sync.email && (
          <>
            <div className="field">
              <label htmlFor="em">Email</label>
              <input id="em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="off" />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <button className="btn primary" disabled={busy || !email || !password} onClick={doSignIn}>
              Sign in
            </button>
          </>
        )}

        {sync.email && (
          <>
            <p className="text-2" style={{ fontSize: 14, marginTop: 0 }}>Signed in as <strong>{sync.email}</strong></p>
            <div className="btn-row">
              <button className="btn" onClick={() => void syncNow()}>
                <Icon name="cloud" size={18} /> Sync now
              </button>
              <button className="btn" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}
      </div>
      <p className="small-print">Everything is saved on the phone first, so the app works offline.</p>

      <div className="section-title">Your data</div>
      <div className="card set-group">
        <button className="set-row" onClick={() => download(`mealplanner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'mealplanner', version: 1, entries: store.all() }), 'application/json')}>
          <span className="grow" style={{ fontWeight: 600 }}>Download full backup</span>
          <Icon name="download" size={20} />
        </button>
        <button className="set-row" onClick={() => backupRef.current?.click()}>
          <span className="grow" style={{ fontWeight: 600 }}>Restore backup</span>
          <Icon name="upload" size={20} />
        </button>
      </div>
      <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="section-title">Coming next</div>
      <div className="card pad text-2" style={{ fontSize: 14 }}>
        Calendar, menus, the joint shopping list and the recipe browser arrive in the next phases.
      </div>

      <p className="small-print" style={{ marginTop: 22 }}>
        Food values: McCance and Widdowson’s Composition of Foods Integrated Dataset 2021 (Public Health England). Contains public sector
        information licensed under the{' '}
        <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">Open Government Licence v3.0</a>.
      </p>
    </>
  );
}
