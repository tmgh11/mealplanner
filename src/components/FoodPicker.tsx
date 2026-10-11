import { useMemo, useState } from 'react';
import { Icon, Sheet } from './ui';
import { FoodEditor } from './FoodsView';
import { useFoods } from '../lib/useFoods';
import { findFoods, searchFoods } from '../lib/foods';
import { parseLine } from '../lib/parse';
import { fmtKcal } from '../lib/nutrition';
import type { Food, Ingredient } from '../lib/types';

/** Choose the food for an ingredient line. */
export function FoodPicker({ ingredient, onPick, onClose }: { ingredient: Ingredient; onPick: (f: Food | 'not-food') => void; onClose: () => void }) {
  const foods = useFoods();
  const parsed = useMemo(() => parseLine(ingredient.text), [ingredient.text]);
  const [q, setQ] = useState(parsed.name);
  const [adding, setAdding] = useState(false);

  const results = useMemo(() => {
    if (!foods.ready) return [];
    const smart = searchFoods(foods.foods, q, { state: parsed.state, limit: 8 }).map((m) => m.food);
    const plain = findFoods(foods.foods, q, 40);
    const seen = new Set(smart.map((f) => f.id));
    return [...smart, ...plain.filter((f) => !seen.has(f.id))].slice(0, 40);
  }, [foods, q, parsed.state]);

  return (
    <Sheet title="Choose the food" onClose={onClose} full>
      <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
        For <strong>{ingredient.text}</strong>. Values are per 100 g; pick the raw, dried or cooked version that matches how you weighed it.
      </p>
      <label className="search" style={{ marginTop: 0 }}>
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search UK food data" aria-label="Search foods" autoFocus />
      </label>
      <div className="card list">
        {results.map((f) => (
          <button key={f.id} className={`row${f.id === ingredient.foodId ? ' current' : ''}`} onClick={() => onPick(f)}>
            <span className="row-main">
              <span className="row-title" style={{ whiteSpace: 'normal' }}>{f.name}</span>
              <span className="row-sub">
                {f.source === 'custom' ? 'Our food' : f.source === 'edited' ? 'Edited' : f.group}
              </span>
            </span>
            <span className="row-amt text-2 num" style={{ fontSize: 14 }}>{fmtKcal(f.per100.kcal)} kcal</span>
          </button>
        ))}
        {foods.ready && results.length === 0 && <div className="empty" style={{ padding: 24 }}>No foods match “{q}”.</div>}
        {!foods.ready && <div className="empty" style={{ padding: 24 }}>Loading the food list…</div>}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add our own
        </button>
        <button className="btn" onClick={() => onPick('not-food')}>Don’t count it</button>
      </div>
      <p className="small-print">Not in the UK data (e.g. gluten-free bread, oat milk)? Add it once from the packet label and it’s matched from then on.</p>
      {adding && <FoodEditor startName={parsed.name} onClose={() => setAdding(false)} onSaved={(f) => onPick(f)} />}
    </Sheet>
  );
}
