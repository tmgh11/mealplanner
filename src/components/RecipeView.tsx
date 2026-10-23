import { useEffect, useMemo, useState } from 'react';
import { Icon, MoreMenu, Sheet, toast } from './ui';
import { WhoTag } from './WhoSwitch';
import { RecipeEditor } from './RecipeEditor';
import { ChooseItemsSheet } from './ShoppingView';
import { NutritionSummary } from './Nutrition';
import { useTracking } from './RecipesView';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { lineFor, toItem } from '../lib/shopping';
import { kcalPer100Cooked, recipeTotals } from '../lib/nutrition';
import type { ShopItem } from '../lib/types';
import { methodSteps } from '../lib/method';
import { fmtMinutes, totalMinutes } from '../lib/times';

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

/** A recipe to read and cook from. Editing sits behind the ⋯ menu. */
export function RecipeView({ id, onClose }: { id: string; onClose: () => void }) {
  const { recipes, device } = useStore();
  const foods = useFoods();
  const tracking = useTracking();
  const r = recipes.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [shopItems, setShopItems] = useState<ShopItem[] | null>(null);
  // steps crossed off while cooking: only for as long as the recipe is open
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const toggleStep = (i: number) =>
    setDone((d) => {
      const next = new Set(d);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const totals = useMemo(() => recipeTotals(r?.ingredients ?? [], foods.get), [r?.ingredients, foods]);

  // deleted (here or from the editor): nothing left to show
  useEffect(() => {
    if (!r) onClose();
  }, [r, onClose]);
  if (!r) return null;

  const addToShopping = () => {
    let t = Date.now();
    const items = r.ingredients
      .map((i) => lineFor(i, 1, i.foodId ? foods.get(i.foodId) : undefined))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => toItem(l, { label: r.title || 'Untitled recipe', recipeId: r.id, forWho: r.owner }, device.me, newId(), t++));
    if (!items.length) return toast('No ingredients to add');
    setShopItems(items);
  };

  const remove = () => {
    store.remove(r.id);
    toast('Recipe deleted', { label: 'Undo', run: () => store.put({ ...r, deleted: false }) });
    onClose();
  };

  const steps = methodSteps(r.method);

  return (
    <>
      <Sheet
        title={r.title || 'Untitled recipe'}
        onClose={onClose}
        full
        headerAction={
          <MoreMenu
            label="Recipe actions"
            items={[
              { label: 'Edit recipe', icon: 'edit', run: () => setEditing(true) },
              { label: 'Delete recipe', icon: 'trash', danger: true, run: remove },
            ]}
          />
        }
      >
        {r.photo && (
          <div className="hero-wrap">
            <img className="hero" src={r.photo} alt="" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')} />
          </div>
        )}

        <div className="recipe-meta">
          <WhoTag who={r.owner} />
          <span>Serves {r.servings}</span>
          {totalMinutes(r) && (
            <span className="recipe-time" title={[r.prepMins && `Prep ${fmtMinutes(r.prepMins)}`, r.cookMins && `Cook ${fmtMinutes(r.cookMins)}`].filter(Boolean).join(' · ')}>
              <Icon name="clock" size={15} /> {fmtMinutes(totalMinutes(r))}
              {r.prepMins && r.cookMins ? <span className="muted"> ({fmtMinutes(r.prepMins)} prep)</span> : null}
            </span>
          )}
          {r.rating ? <span aria-label={`${r.rating} stars`}>{'★'.repeat(r.rating)}</span> : null}
          {r.sourceUrl && (
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="link" size={14} /> {host(r.sourceUrl)}
            </a>
          )}
        </div>

        {r.ingredients.length > 0 && (
          <button className="btn primary shop-btn" onClick={addToShopping}>
            <Icon name="cart" size={18} /> Add to the shopping list
          </button>
        )}

        <div className="section-title">Ingredients</div>
        {r.ingredients.length ? (
          <div className="card read-list">
            {r.ingredients.map((i) =>
              i.heading ? (
                <div key={i.id} className="ing-heading">{i.text}</div>
              ) : (
                <div key={i.id} className="read-ing">{i.text}</div>
              ),
            )}
          </div>
        ) : (
          <p className="small-print">No ingredients yet. Add them with ⋯ → Edit recipe.</p>
        )}

        {tracking && r.ingredients.length > 0 && <NutritionSummary totals={totals} servings={r.servings} per100Cooked={kcalPer100Cooked(r, totals)} />}

        {steps.length > 0 && (
          <>
            <div className="section-title">
              Method
              {done.size > 0 ? (
                <button className="link-btn small aside" onClick={() => setDone(new Set())}>Untick all</button>
              ) : (
                <span className="aside">Tap a step to cross it off</span>
              )}
            </div>
            <div className="read-method">
              {steps.map((s, i) =>
                s.heading ? (
                  <div key={i} className="ing-heading">{s.text}</div>
                ) : (
                  <button key={i} type="button" className={`step${done.has(i) ? ' done' : ''}`} onClick={() => toggleStep(i)} aria-pressed={done.has(i)}>
                    <span className="step-n">{done.has(i) ? <Icon name="check" size={14} stroke={3} /> : s.n}</span>
                    <p>{s.text}</p>
                  </button>
                ),
              )}
            </div>
          </>
        )}

        {r.notes && (
          <>
            <div className="section-title">Notes</div>
            <p className="read-notes">{r.notes}</p>
          </>
        )}

        {r.tags.length > 0 && (
          <div className="tag-row bottom">
            {r.tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        )}
      </Sheet>

      {editing && <RecipeEditor initial={r} onClose={() => setEditing(false)} />}
      {shopItems && <ChooseItemsSheet title="Add to shopping list" items={shopItems} note={`Everything for ${r.title || 'this recipe'} (serves ${r.servings}).`} onClose={() => setShopItems(null)} />}
    </>
  );
}
