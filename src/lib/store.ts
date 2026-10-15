/**
 * Local-first store (from Billsplit). Everything is kept in memory and on the phone (IndexedDB) so the
 * app opens instantly and works offline; changes are queued ("dirty") and pushed to Supabase
 * when possible. Conflicts resolve last-write-wins on each entry's `updatedAt`.
 */
import { useSyncExternalStore } from 'react';
import type { Entry, FoodEntry, Meal, Menu, Person, Recipe, Settings, ShopItem, Who } from './types';
import { SETTINGS_ID, defaultSettings } from './types';
import { openPersistence, type Persistence } from './persist';

const K = {
  device: 'mealplanner.device',
};

export type SyncState = 'local' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface DeviceSettings {
  me: Person;
  /** the Tom / Nuria / Both switch; starts on this phone's person each time the app opens */
  view?: Who;
  /** the shopping list's own switch; starts on Both */
  shopView?: Who;
  /** the calendar: one day at a time, or the whole week */
  calMode?: 'day' | 'week';
  supabaseUrl?: string;
  supabaseKey?: string;
  onboarded?: boolean;
}

export interface Snapshot {
  /** false until the ledger has been read from the phone's storage */
  loaded: boolean;
  recipes: Recipe[];
  /** our edits to CoFID foods, and our own foods */
  foodEntries: FoodEntry[];
  /** every meal on the calendar, by date (YYYY-MM-DD) */
  mealsByDate: Map<string, Meal[]>;
  menus: Menu[];
  shopping: ShopItem[];
  settings: Settings;
  device: DeviceSettings;
  sync: { state: SyncState; message?: string; lastSynced?: number; email?: string };
}

type Ledger = Pick<Snapshot, 'recipes' | 'foodEntries' | 'mealsByDate' | 'menus' | 'shopping' | 'settings'>;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Could not save', key, e);
  }
}

export const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);

type Listener = () => void;

class Store {
  private entries = new Map<string, Entry>();
  private dirty = new Set<string>();
  private loaded = false;
  private persistence: Persistence | null = null;
  /** ids changed in memory but not yet written to the phone's storage */
  private unsaved = new Set<string>();
  private writing: Promise<void> = Promise.resolve();
  /** how far this phone has pulled from Supabase (saved alongside the entries it covers) */
  private cursor: string | null = null;
  /** resolves once the ledger has been loaded from storage */
  readonly ready: Promise<void>;
  // The Tom / Nuria / Both switches only last while the app is open: each time it starts, the
  // calendar and recipes go back to this phone's person and the shopping list back to Both.
  private device: DeviceSettings = (({ view: _v, shopView: _s, ...rest }) => rest)(load<DeviceSettings>(K.device, { me: 'tom' }));
  private syncInfo: Snapshot['sync'] = { state: 'local' };
  private listeners = new Set<Listener>();
  private snap: Snapshot | null = null;
  private ledger: Ledger | null = null;
  private persistTimer: number | undefined;
  /** set by the sync module */
  onDirty: (() => void) | null = null;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    try {
      this.persistence = await openPersistence();
      const { entries, dirty, cursor } = await this.persistence.loadAll();
      // anything created before loading finished (unlikely) wins over what was stored
      for (const e of entries) if (!this.entries.has(e.id)) this.entries.set(e.id, e);
      for (const id of dirty) this.dirty.add(id);
      this.cursor = cursor;
    } catch (e) {
      // cursor stays null, so the next sync pulls the whole ledger rather than just what's new
      console.error('Could not load saved data', e);
    }
    this.loaded = true;
    this.changed([]);
  }

  storageKind() {
    return this.persistence?.kind ?? 'loading';
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): Snapshot => {
    if (this.snap) return this.snap;
    this.ledger ??= this.buildLedger();
    this.snap = { ...this.ledger, loaded: this.loaded, device: this.device, sync: this.syncInfo };
    return this.snap;
  };

  /** The sorted lists. Only rebuilt when entries change, not on every sync-status update. */
  private buildLedger(): Ledger {
    const recipes: Recipe[] = [];
    const foodEntries: FoodEntry[] = [];
    const mealsByDate = new Map<string, Meal[]>();
    const menus: Menu[] = [];
    const shopping: ShopItem[] = [];
    let settings = defaultSettings();
    for (const e of this.entries.values()) {
      if (e.kind === 'settings') {
        const d = defaultSettings();
        settings = { ...d, ...e, tracking: { ...d.tracking, ...e.tracking } };
      } else if (e.deleted) continue;
      else if (e.kind === 'recipe') recipes.push(e);
      else if (e.kind === 'food') foodEntries.push(e);
      else if (e.kind === 'menu') menus.push(e);
      else if (e.kind === 'shop') shopping.push(e);
      else if (e.kind === 'meal') {
        const list = mealsByDate.get(e.date);
        if (list) list.push(e);
        else mealsByDate.set(e.date, [e]);
      }
    }
    for (const list of mealsByDate.values()) list.sort((a, b) => a.order - b.order || a.updatedAt - b.updatedAt);
    menus.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true, sensitivity: 'base' }));
    recipes.sort((a, b) => a.title.localeCompare(b.title, 'en-GB', { sensitivity: 'base' }));
    shopping.sort((a, b) => a.addedAt - b.addedAt);
    return { recipes, foodEntries, mealsByDate, menus, shopping, settings };
  }

  /** Entries changed: rebuild the lists, write `ids` to the phone's storage, and update the UI. */
  private changed(ids: Iterable<string>) {
    this.ledger = null;
    for (const id of ids) this.unsaved.add(id);
    this.schedulePersist();
    this.notify();
  }

  /** Something other than the entries changed (sync status, device settings): lists are reused. */
  private notify() {
    this.snap = null;
    this.listeners.forEach((l) => l());
  }

  private schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => void this.flush(), 30);
  }

  /** Write pending changes to the phone's storage (serialised so writes never overlap). */
  flush(): Promise<void> {
    clearTimeout(this.persistTimer);
    if (!this.persistence || !this.loaded) return this.writing;
    const p = this.persistence;
    // Decide what to write only once earlier writes have finished, so entries from a failed write
    // are retried in the same transaction as any pull cursor that covers them.
    this.writing = this.writing.then(async () => {
      const ids = [...this.unsaved];
      this.unsaved.clear();
      const changed = ids.map((id) => this.entries.get(id)).filter(Boolean) as Entry[];
      try {
        await p.write(changed, [...this.dirty], this.cursor, () => this.entries.values());
      } catch (e) {
        console.error('Could not save to the phone', e);
        ids.forEach((id) => this.unsaved.add(id)); // retry on the next change
      }
    });
    return this.writing;
  }

  getPullCursor() {
    return this.cursor;
  }
  /** Call after `merge`-ing the rows the cursor covers; both are saved together. */
  setPullCursor(cursor: string | null) {
    this.cursor = cursor;
    this.schedulePersist();
  }

  get(id: string) {
    return this.entries.get(id);
  }
  has(id: string) {
    return this.entries.has(id);
  }
  all() {
    return [...this.entries.values()];
  }
  settings(): Settings {
    return this.getSnapshot().settings;
  }

  put(...list: Entry[]) {
    const now = Date.now();
    for (const e of list) {
      const stamped = { ...e, updatedAt: Math.max(now, (this.entries.get(e.id)?.updatedAt ?? 0) + 1) } as Entry;
      this.entries.set(e.id, stamped);
      this.dirty.add(e.id);
    }
    this.changed(list.map((e) => e.id));
    this.onDirty?.();
  }

  remove(id: string) {
    const e = this.entries.get(id);
    if (e) this.put({ ...e, deleted: true });
  }

  updateSettings(patch: Partial<Settings>) {
    this.put({ ...this.settings(), ...patch, id: SETTINGS_ID, kind: 'settings' });
  }

  /** Apply entries from the server. Returns true if anything changed. */
  merge(remote: Entry[]): boolean {
    const changedIds: string[] = [];
    for (const r of remote) {
      const local = this.entries.get(r.id);
      if (!local || r.updatedAt > local.updatedAt) {
        this.entries.set(r.id, r);
        this.dirty.delete(r.id);
        changedIds.push(r.id);
      } else if (r.updatedAt === local.updatedAt) {
        this.dirty.delete(r.id);
      }
    }
    if (changedIds.length) this.changed(changedIds);
    return changedIds.length > 0;
  }

  dirtyEntries(): Entry[] {
    return [...this.dirty].map((id) => this.entries.get(id)).filter(Boolean) as Entry[];
  }
  /** Queue entries to be pushed again on this sync (e.g. the server turned out not to have them). */
  markDirty(ids: string[]) {
    if (!ids.length) return;
    for (const id of ids) if (this.entries.has(id)) this.dirty.add(id);
    this.schedulePersist(); // saves the longer dirty list; nothing on screen changes
  }
  markClean(ids: string[], pushed: Map<string, number>) {
    for (const id of ids) {
      // only clear if not edited again while the push was in flight
      if (this.entries.get(id)?.updatedAt === pushed.get(id)) this.dirty.delete(id);
    }
    this.schedulePersist(); // saves the shorter dirty list; nothing on screen changes
  }

  setDevice(patch: Partial<DeviceSettings>) {
    this.device = { ...this.device, ...patch };
    const { view: _v, shopView: _s, ...lasting } = this.device;
    save(K.device, lasting);
    this.notify();
  }
  getDevice() {
    return this.device;
  }

  setSync(info: Partial<Snapshot['sync']>) {
    this.syncInfo = { ...this.syncInfo, ...info };
    this.notify();
  }

  /** Replace everything (used by "import backup"). */
  importEntries(list: Entry[]) {
    const now = Date.now();
    const ids: string[] = [];
    for (const e of list) {
      const existing = this.entries.get(e.id);
      if (!existing || e.updatedAt >= existing.updatedAt) {
        this.entries.set(e.id, { ...e, updatedAt: Math.max(now, e.updatedAt) } as Entry);
        this.dirty.add(e.id);
        ids.push(e.id);
      }
    }
    this.changed(ids);
    this.onDirty?.();
  }
}

export const store = new Store();

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// Save immediately when the app is backgrounded or closed.
window.addEventListener('pagehide', () => void store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void store.flush();
});
