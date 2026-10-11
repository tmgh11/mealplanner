import { useMemo, useState } from 'react';
import { Icon } from './ui';
import { WhoSwitch, WhoTag, useView } from './WhoSwitch';
import { RecipeEditor } from './RecipeEditor';
import { useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { perServing, recipeTotals, fmtKcal } from '../lib/nutrition';
import { visibleIn, type Recipe } from '../lib/types';

/** Does the person on this phone want to see nutrition? */
export function useTracking() {
  const { settings, device } = useStore();
  return settings.tracking[device.me]?.on ?? false;
}

export function RecipesView() {
  const { recipes } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ recipe?: Recipe } | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return recipes.filter(
      (r) =>
        visibleIn(r.owner, view) &&
        words.every((w) => r.title.toLowerCase().includes(w) || r.tags.some((t) => t.toLowerCase().includes(w)) || r.ingredients.some((i) => i.text.toLowerCase().includes(w))),
    );
  }, [recipes, view, q]);

  return (
    <>
      <WhoSwitch />
      <label className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" />
      </label>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="book" size={26} /></div>
          {recipes.length === 0 ? (
            <>
              <p style={{ margin: '0 0 4px', fontWeight: 650, color: 'var(--text)' }}>No recipes yet</p>
              <p style={{ margin: 0 }}>Add one and paste in its ingredients. Weights are matched to UK food data automatically.</p>
            </>
          ) : (
            <p style={{ margin: 0 }}>Nothing matches{view !== 'both' ? ' in this view' : ''}.</p>
          )}
        </div>
      ) : (
        <div className="card list">
          {shown.map((r) => {
            const t = foods.ready ? recipeTotals(r.ingredients, foods.get) : null;
            const kcal = t ? perServing(r, t).kcal : null;
            return (
              <button key={r.id} className="row" onClick={() => setOpen({ recipe: r })}>
                <span className="row-main">
                  <span className="row-title">{r.title || 'Untitled recipe'}</span>
                  <span className="row-sub">
                    {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'} · serves {r.servings}
                    {r.tags.length ? ` · ${r.tags.join(', ')}` : ''}
                  </span>
                </span>
                <span className="row-amt">
                  <WhoTag who={r.owner} />
                  {tracking && kcal != null && kcal > 0 && <span className="eff text-2" style={{ display: 'block', marginTop: 4 }}>{fmtKcal(kcal)} kcal</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="home-actions">
        <button className="btn primary add" onClick={() => setOpen({})}>
          <Icon name="plus" size={22} stroke={2.4} /> Add recipe
        </button>
      </div>

      {open && <RecipeEditor initial={open.recipe} onClose={() => setOpen(null)} />}
    </>
  );
}
