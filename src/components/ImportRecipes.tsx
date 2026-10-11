import { useMemo, useRef, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { paprikaToRecipe, readPaprika, type PaprikaRecipe } from '../lib/paprika';
import type { Who } from '../lib/types';

/** Recipes → Import from Paprika: choose the .paprikarecipes file, pick which, choose whose. */
export function PaprikaImportSheet({ onClose }: { onClose: () => void }) {
  const { settings, recipes, device } = useStore();
  const foods = useFoods();
  const fileRef = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<PaprikaRecipe[] | null>(null);
  const [who, setWho] = useState<Who>('both');
  const [off, setOff] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const have = useMemo(() => new Set(recipes.map((r) => r.importId).filter(Boolean)), [recipes]);
  const fresh = (found ?? []).filter((p) => !have.has(`paprika:${p.uid}`));
  const chosen = fresh.filter((p) => !off.has(p.uid));

  const load = async (f?: File) => {
    if (!f) return;
    setError(undefined);
    try {
      const list = readPaprika(new Uint8Array(await f.arrayBuffer()));
      if (!list.length) throw new Error();
      setFound(list.sort((a, b) => a.name.localeCompare(b.name)));
      setOff(new Set());
    } catch {
      setError('Couldn’t read that file. In Paprika, use Export → All Recipes and choose the .paprikarecipes file it makes.');
    }
  };

  const run = () => {
    if (!foods.ready) return toast('The food list is still loading — try again in a moment');
    setBusy(true);
    // let the button show "Importing…" before the matching work starts
    setTimeout(() => {
      const made = chosen.map((p) => paprikaToRecipe(p, who, foods.foods, device.me, newId));
      store.put(...made);
      toast(`Imported ${made.length} recipe${made.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...made.map((r) => ({ ...r, deleted: true }))) });
      onClose();
    }, 30);
  };

  return (
    <Sheet
      title="Import from Paprika"
      onClose={onClose}
      full
      footer={
        found ? (
          <button className="btn primary" disabled={!chosen.length || busy} onClick={run}>
            {busy ? 'Importing…' : chosen.length ? `Import ${chosen.length} recipe${chosen.length === 1 ? '' : 's'}` : 'Nothing to import'}
          </button>
        ) : undefined
      }
    >
      {!found ? (
        <>
          <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
            In Paprika, go to <strong>Settings → Export</strong> (or select recipes, then <strong>Share → Export</strong>) and save the
            <strong> .paprikarecipes</strong> file. Then choose it here.
          </p>
          <button className="dropzone" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={28} />
            <strong>Choose Paprika export</strong>
          </button>
          <input ref={fileRef} type="file" accept=".paprikarecipes,.paprikarecipe,application/zip,application/octet-stream" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <p className="small-print" style={{ color: 'var(--danger)' }}>{error}</p>}
          <p className="small-print">
            Photos, categories (as tags), ratings, notes and source links come across. Ingredients are matched to the UK food data;
            Paprika’s own nutrition notes aren’t copied.
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <span className="field-label">Whose recipes</span>
            <Seg<Who>
              value={who}
              onChange={setWho}
              options={[
                { value: 'tom', label: settings.names.tom, className: 'tom' },
                { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </div>
          <p className="small-print" style={{ marginTop: -6 }}>
            {found.length} recipes in the file{found.length - fresh.length ? `; ${found.length - fresh.length} already imported` : ''}.
          </p>
          {fresh.length > 0 && (
            <>
              <div className="btn-row" style={{ marginBottom: 8 }}>
                <button className="btn small grow-btn" onClick={() => setOff(new Set())} disabled={!off.size}>Tick all</button>
                <button className="btn small grow-btn" onClick={() => setOff(new Set(fresh.map((p) => p.uid)))} disabled={off.size === fresh.length}>Untick all</button>
              </div>
              <div className="card list shop-list">
                {fresh.map((p) => {
                  const on = !off.has(p.uid);
                  return (
                    <button
                      key={p.uid}
                      className={`shop-row pick${on ? ' done' : ' skipped'}`}
                      onClick={() => {
                        const next = new Set(off);
                        if (on) next.add(p.uid);
                        else next.delete(p.uid);
                        setOff(next);
                      }}
                      aria-pressed={on}
                    >
                      <span className="tick">{on && <Icon name="check" size={16} stroke={3} />}</span>
                      {p.photo_data ? <img className="thumb" src={`data:image/jpeg;base64,${p.photo_data}`} alt="" /> : null}
                      <span className="shop-main">
                        <span className="shop-name">{p.name}</span>
                        <span className="shop-sub">{[...(p.categories ?? []), p.rating ? '★'.repeat(p.rating) : ''].filter(Boolean).join(' · ') || ' '}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
