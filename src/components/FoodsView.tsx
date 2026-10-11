import { useMemo, useState } from 'react';
import { Icon, Sheet, toast } from './ui';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { findFoods } from '../lib/foods';
import { fmtG, fmtKcal } from '../lib/nutrition';
import { NUTRIENT_KEYS, type Food, type FoodEntry, type Nutrients, type NutrientKey, type Portion } from '../lib/types';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy (kcal)', protein: 'Protein (g)', carbs: 'Carbohydrate (g)', fat: 'Fat (g)', fibre: 'Fibre (g)', sugars: 'of which sugars (g)', salt: 'Salt (g)',
};

export function FoodsView() {
  const { settings } = useStore();
  const foods = useFoods();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Food | null>(null);
  const [adding, setAdding] = useState(false);

  const results = useMemo(() => (q.trim() ? findFoods(foods.foods, q, 80) : foods.foods.filter((f) => f.source !== 'cofid')), [foods, q]);

  return (
    <>
      <label className="search" style={{ marginTop: 0 }}>
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 2,886 UK foods" aria-label="Search foods" />
      </label>

      {!q.trim() && <div className="section-title" style={{ marginTop: 6 }}>Our foods and edits</div>}
      {results.length > 0 ? (
        <div className="card list">
          {results.map((f) => (
            <button key={f.id} className="row" onClick={() => setOpen(f)}>
              <span className="row-main">
                <span className="row-title" style={{ whiteSpace: 'normal' }}>{f.name}</span>
                <span className="row-sub">{f.source === 'custom' ? 'Our food' : f.source === 'edited' ? `Edited${f.editedBy ? ` by ${settings.names[f.editedBy]}` : ''}` : f.group}</span>
              </span>
              <span className="row-amt text-2 num" style={{ fontSize: 14 }}>{fmtKcal(f.per100.kcal)} kcal</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          {q.trim() ? (
            <p style={{ margin: 0 }}>{foods.ready ? `No foods match “${q}”.` : 'Loading the food list…'}</p>
          ) : (
            <p style={{ margin: 0 }}>
              Search the UK government’s food data above. Foods you add yourself, and any you correct (e.g. from a packet label), show up here.
            </p>
          )}
        </div>
      )}

      <div className="home-actions">
        <button className="btn primary add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={22} stroke={2.4} /> Add our own food
        </button>
      </div>

      {open && <FoodDetail food={foods.get(open.id) ?? open} onClose={() => setOpen(null)} />}
      {adding && <FoodEditor startName={q.trim()} onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
    </>
  );
}

function FoodDetail({ food, onClose }: { food: Food; onClose: () => void }) {
  const { settings } = useStore();
  const [editing, setEditing] = useState(false);
  const reset = () => {
    const entry = store.get(food.id);
    store.remove(food.id);
    toast('Back to the UK data values', entry ? { label: 'Undo', run: () => store.put({ ...(entry as FoodEntry), deleted: false }) } : undefined);
    onClose();
  };
  return (
    <Sheet title={food.name} onClose={onClose}>
      <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
        {food.source === 'cofid' && <>From the UK government’s food data (CoFID 2021). Per 100 g.</>}
        {food.source === 'edited' && <>Edited{food.editedBy ? ` by ${settings.names[food.editedBy]}` : ''}; UK data values shown in grey. Per 100 g.</>}
        {food.source === 'custom' && <>One of our own foods{food.editedBy ? `, added by ${settings.names[food.editedBy]}` : ''}. Per 100 g.</>}
      </p>
      <div className="card set-group">
        {NUTRIENT_KEYS.map((k) => (
          <div key={k} className="set-row" style={{ padding: '11px 16px' }}>
            <span className="grow">{LABELS[k]}</span>
            {food.original && food.original[k] !== food.per100[k] && <span className="muted num" style={{ textDecoration: 'line-through' }}>{k === 'kcal' ? fmtKcal(food.original[k]) : fmtG(food.original[k])}</span>}
            <strong className="num">{k === 'kcal' ? fmtKcal(food.per100[k]) : fmtG(food.per100[k])}</strong>
          </div>
        ))}
      </div>
      {food.portions.length > 0 && (
        <p className="small-print">
          Typical weights: {food.portions.map((p) => `${p.unit === 'each' ? 'one' : `1 ${p.unit}`} = ${p.grams} g`).join(' · ')}
        </p>
      )}
      <div className="btn-row" style={{ marginTop: 14 }}>
        {food.source === 'edited' && <button className="btn" onClick={reset}>Reset</button>}
        <button className="btn primary" onClick={() => setEditing(true)}>
          <Icon name="edit" size={18} /> {food.source === 'custom' ? 'Edit' : 'Correct values'}
        </button>
      </div>
      {editing && <FoodEditor food={food} onClose={() => setEditing(false)} onSaved={onClose} />}
    </Sheet>
  );
}

const toStr = (n: number | null | undefined) => (n == null ? '' : String(n));
const toNum = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/** Add our own food, or correct a UK data food (the original values are kept). */
export function FoodEditor({ food, startName, onClose, onSaved }: { food?: Food; startName?: string; onClose: () => void; onSaved: (f: Food) => void }) {
  const { device } = useStore();
  const custom = !food || food.source === 'custom';
  const [name, setName] = useState(food?.name ?? startName ?? '');
  const [vals, setVals] = useState<Record<NutrientKey, string>>(() => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, toStr(food?.per100[k])])) as Record<NutrientKey, string>);
  const [portions, setPortions] = useState<Portion[]>(food?.portions ?? []);

  const save = () => {
    if (custom && !name.trim()) return toast('Give it a name');
    const per100 = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, toNum(vals[k])])) as unknown as Nutrients;
    if (per100.kcal == null) return toast('Add the calories per 100 g (from the label)');
    const id = food?.id ?? newId();
    const clean = portions.filter((p) => p.unit.trim() && p.grams > 0).map((p) => ({ unit: p.unit.trim().toLowerCase(), grams: p.grams }));
    const entry: FoodEntry = {
      id,
      kind: 'food',
      name: custom ? name.trim() : undefined,
      per100,
      portions: clean,
      editedBy: device.me,
      deleted: false,
      updatedAt: 0,
    };
    store.put(entry);
    toast(custom ? (food ? 'Food saved' : 'Food added') : 'Values corrected');
    onSaved({
      id,
      name: custom ? name.trim() : food!.name,
      group: food?.group ?? 'Our foods',
      per100,
      portions: clean,
      source: custom ? 'custom' : 'edited',
      editedBy: device.me,
    });
    onClose();
  };

  return (
    <Sheet
      title={custom ? (food ? 'Edit food' : 'Add our own food') : 'Correct values'}
      onClose={onClose}
      full
      footer={<button className="btn primary" onClick={save}>Save</button>}
    >
      {custom ? (
        <div className="field">
          <label htmlFor="fn">Name</label>
          <input id="fn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gluten-free bread (Genius)" />
        </div>
      ) : (
        <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
          {food!.name}. Your values replace the UK data for both of you; the original is kept and you can reset it.
        </p>
      )}
      <p className="small-print" style={{ marginTop: 0 }}>Per 100 g, as on the “per 100 g” column of a label. Leave blank if unknown.</p>
      <div className="card set-group">
        {NUTRIENT_KEYS.map((k) => (
          <label key={k} className="set-row" style={{ padding: '6px 8px 6px 16px' }}>
            <span className="grow">{LABELS[k]}</span>
            <input
              className="input num"
              style={{ width: 110, textAlign: 'right', minHeight: 44 }}
              inputMode="decimal"
              value={vals[k]}
              placeholder={food?.original ? toStr(food.original[k]) : ''}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <div className="section-title">Typical weights</div>
      <p className="small-print" style={{ marginTop: -4 }}>So “1 slice” or “2 cloves” can be counted. Use “each” for one whole item.</p>
      {portions.map((p, i) => (
        <div key={i} className="inline" style={{ marginBottom: 8, alignItems: 'center' }}>
          <input className="input" value={p.unit} onChange={(e) => setPortions(portions.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} placeholder="slice" aria-label="Unit" />
          <input className="input num" inputMode="decimal" value={p.grams || ''} onChange={(e) => setPortions(portions.map((x, j) => (j === i ? { ...x, grams: toNum(e.target.value) ?? 0 } : x)))} placeholder="grams" aria-label="Grams" />
          <button className="icon-btn" style={{ flex: 'none' }} onClick={() => setPortions(portions.filter((_, j) => j !== i))} aria-label="Remove">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setPortions([...portions, { unit: '', grams: 0 }])}>
        <Icon name="plus" size={18} /> Add a typical weight
      </button>
    </Sheet>
  );
}
