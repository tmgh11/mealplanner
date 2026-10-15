import { useMemo, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { IngredientsEditor } from './IngredientsEditor';
import { ChooseItemsSheet } from './ShoppingView';
import { NutritionSummary } from './Nutrition';
import { useTracking } from './RecipesView';
import { useView } from './WhoSwitch';
import { newId, store, useStore } from '../lib/store';
import { lineFor, toItem } from '../lib/shopping';
import type { ShopItem } from '../lib/types';
import { useFoods } from '../lib/useFoods';
import { fmtKcal, kcalPer100Cooked, perServing, recipeTotals } from '../lib/nutrition';
import type { Recipe, Who } from '../lib/types';

function blank(owner: Who): Recipe {
  return { id: newId(), kind: 'recipe', title: '', owner, servings: 2, ingredients: [], method: '', tags: [], updatedAt: 0 };
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function RecipeEditor({ initial, draft, onClose }: { initial?: Recipe; draft?: Recipe; onClose: () => void }) {
  const { settings, device } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [r, setR] = useState<Recipe>(() => initial ?? draft ?? { ...blank(view), createdBy: device.me });
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [orig] = useState(r);
  const dirty = JSON.stringify(r) !== JSON.stringify(orig) || tags !== (initial?.tags ?? []).join(', ');

  const set = (patch: Partial<Recipe>) => setR((x) => ({ ...x, ...patch }));

  const totals = useMemo(() => recipeTotals(r.ingredients, foods.get), [r.ingredients, foods]);
  const serving = perServing(r, totals);
  const per100 = kcalPer100Cooked(r, totals);

  const save = () => {
    const clean: Recipe = {
      ...r,
      title: r.title.trim() || 'Untitled recipe',
      ingredients: r.ingredients.filter((i) => !i.heading || i.text.trim()),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      sourceUrl: r.sourceUrl?.trim() || undefined,
    };
    store.put(clean);
    toast(initial ? 'Recipe saved' : 'Recipe added');
    onClose();
  };

  const remove = () => {
    if (!initial) return onClose();
    store.remove(initial.id);
    toast('Recipe deleted', { label: 'Undo', run: () => store.put({ ...initial, deleted: false }) });
    onClose();
  };

  const [shopItems, setShopItems] = useState<ShopItem[] | null>(null);
  const addToShopping = () => {
    let t = Date.now();
    const items: ShopItem[] = r.ingredients
      .map((i) => lineFor(i, 1, i.foodId ? foods.get(i.foodId) : undefined))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => toItem(l, { label: r.title.trim() || 'Untitled recipe', recipeId: r.id, forWho: r.owner }, device.me, newId(), t++));
    if (!items.length) return toast('No ingredients to add');
    setShopItems(items);
  };

  const ownerName = r.owner === 'both' ? 'our' : `${settings.names[r.owner]}’s`;
  const unknown = totals.missing.length;

  return (
    <Sheet
      title={initial ? 'Edit recipe' : 'New recipe'}
      onClose={onClose}
      full
      dirty={dirty}
      footer={
        <div className="btn-row">
          {initial && (
            <button className="btn delete" onClick={remove} aria-label="Delete recipe">
              <Icon name="trash" size={20} />
            </button>
          )}
          <button className="btn primary save" onClick={save}>
            <span>Save {ownerName} recipe</span>
            {tracking && totals.sum.kcal != null && totals.sum.kcal > 0 && (
              <span className="save-sub">
                {fmtKcal(serving.kcal)} kcal a serving{unknown ? ` · ${unknown} not counted` : ''}
              </span>
            )}
          </button>
        </div>
      }
    >
      {r.photo && (
        <div className="hero-wrap">
          <img className="hero" src={r.photo} alt="" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')} />
          <button className="icon-btn small hero-remove" onClick={() => set({ photo: undefined })} aria-label="Remove photo">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <div className="field">
        <label htmlFor="rt">Name</label>
        <input id="rt" className="input" value={r.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Lentil and chorizo stew" />
      </div>

      <div className="field">
        <span className="field-label">Whose recipe</span>
        <Seg<Who>
          value={r.owner}
          onChange={(owner) => set({ owner })}
          options={[
            { value: 'tom', label: settings.names.tom, className: 'tom' },
            { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>

      <div className="inline">
        <div className="field">
          <label htmlFor="rs">Servings</label>
          <input id="rs" className="input" inputMode="numeric" value={r.servings || ''} onChange={(e) => set({ servings: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </div>
        <div className="field">
          <label htmlFor="rw">Cooked weight (g)</label>
          <input id="rw" className="input" inputMode="decimal" value={r.cookedWeight ?? ''} onChange={(e) => set({ cookedWeight: num(e.target.value) })} placeholder="optional" />
        </div>
      </div>
      <p className="small-print" style={{ marginTop: -8, marginBottom: 14 }}>
        Weigh the finished pot to serve portions by weight; each of you can then weigh your own plate.
      </p>

      <div className="section-title" style={{ marginTop: 8 }}>
        Ingredients
        {r.ingredients.length > 0 && <span className="aside">{Math.round(totals.grams)} g counted</span>}
      </div>

      <IngredientsEditor ingredients={r.ingredients} onChange={(ingredients) => set({ ingredients })} />
      {r.ingredients.length > 0 && (
        <button className="btn" onClick={addToShopping}>
          <Icon name="cart" size={18} /> Add ingredients to the shopping list
        </button>
      )}

      {tracking && r.ingredients.length > 0 && (
        <NutritionSummary
          totals={totals}
          servings={r.servings}
          per100Cooked={per100}
        />
      )}

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="rm">Method</label>
        <textarea id="rm" className="input" rows={6} value={r.method} onChange={(e) => set({ method: e.target.value })} placeholder="Steps, one per line" />
      </div>
      <div className="field">
        <label htmlFor="ru">Source link</label>
        <input id="ru" className="input" value={r.sourceUrl ?? ''} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://…" autoCapitalize="off" autoCorrect="off" inputMode="url" />
      </div>
      <div className="field">
        <label htmlFor="rg">Tags</label>
        <input id="rg" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. lunch, legume day, batch cook" />
      </div>
      <div className="field">
        <label htmlFor="rn">Notes</label>
        <textarea id="rn" className="input" rows={2} value={r.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
      </div>

      {shopItems && <ChooseItemsSheet title="Add to shopping list" items={shopItems} note={`Everything for ${r.title.trim() || 'this recipe'} (serves ${r.servings}).`} onClose={() => setShopItems(null)} />}
    </Sheet>
  );
}
