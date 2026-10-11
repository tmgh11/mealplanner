import { useMemo, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { FoodPicker } from './FoodPicker';
import { NutritionSummary } from './Nutrition';
import { useTracking } from './RecipesView';
import { useView } from './WhoSwitch';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { flags, regram, resolveLine } from '../lib/ingredients';
import { splitRecipeIngredients, formatQty, parseLine } from '../lib/parse';
import { fmtKcal, kcalPer100Cooked, perServing, recipeTotals } from '../lib/nutrition';
import type { Food, Ingredient, Recipe, Who } from '../lib/types';

function blank(owner: Who): Recipe {
  return { id: newId(), kind: 'recipe', title: '', owner, servings: 2, ingredients: [], method: '', tags: [], updatedAt: 0 };
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function RecipeEditor({ initial, onClose }: { initial?: Recipe; onClose: () => void }) {
  const { settings, device } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [r, setR] = useState<Recipe>(() => initial ?? { ...blank(view), createdBy: device.me });
  const [paste, setPaste] = useState('');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [picking, setPicking] = useState<Ingredient | null>(null);
  const [orig] = useState(r);
  const dirty = JSON.stringify(r) !== JSON.stringify(orig) || paste.trim() !== '' || tags !== (initial?.tags ?? []).join(', ');

  const set = (patch: Partial<Recipe>) => setR((x) => ({ ...x, ...patch }));
  const setIng = (id: string, patch: Partial<Ingredient>) => set({ ingredients: r.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const totals = useMemo(() => recipeTotals(r.ingredients, foods.get), [r.ingredients, foods]);
  const serving = perServing(r, totals);
  const per100 = kcalPer100Cooked(r, totals);

  const addLines = () => {
    const lines = splitRecipeIngredients(paste);
    if (!lines.length) return;
    if (!foods.ready) return toast('The food list is still loading — try again in a moment');
    set({ ingredients: [...r.ingredients, ...lines.map((l) => resolveLine(l, foods.foods).ingredient)] });
    setPaste('');
  };

  const pick = (ing: Ingredient, food: Food | null | 'not-food') => {
    if (food === 'not-food') setIng(ing.id, { foodId: null, grams: undefined, gramsSetByHand: undefined });
    else {
      const next = regram(ing, food);
      setIng(ing.id, ing.gramsSetByHand ? { foodId: next.foodId } : { foodId: next.foodId, grams: next.grams });
    }
    setPicking(null);
  };

  const save = () => {
    const clean: Recipe = {
      ...r,
      title: r.title.trim() || 'Untitled recipe',
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

      {r.ingredients.length > 0 && (
        <div className="card ing-list">
          {r.ingredients.map((ing) => {
            const food = ing.foodId ? foods.get(ing.foodId) : undefined;
            const f = flags(ing, food);
            return (
              <div key={ing.id} className="ing">
                <div className="ing-top">
                  <span className="ing-text">{ing.text}</span>
                  <button className="icon-btn small" onClick={() => set({ ingredients: r.ingredients.filter((x) => x.id !== ing.id) })} aria-label={`Remove ${ing.text}`}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="ing-bottom">
                  <button className={`ing-food${f.noMatch ? ' warn' : ''}`} onClick={() => setPicking(ing)}>
                    {ing.foodId === null ? 'Not counted' : food ? food.name : 'No match — choose a food'}
                    {food && food.source !== 'cofid' && <span className="badge-mini">{food.source === 'custom' ? 'ours' : 'edited'}</span>}
                  </button>
                  {ing.foodId !== null && (
                    <label className="grams">
                      <input
                        inputMode="decimal"
                        value={ing.grams ?? ''}
                        placeholder="?"
                        onChange={(e) => setIng(ing.id, { grams: num(e.target.value), gramsSetByHand: true })}
                        aria-label={`Grams of ${ing.text}`}
                      />
                      g
                    </label>
                  )}
                </div>
                {(f.estimated || f.noWeight || f.checkState) && (
                  <div className="ing-flags">
                    {f.noWeight && <span className="flag warn">Needs a weight</span>}
                    {f.estimated && <span className="flag">≈ typical weight of {formatQty(ing.qty ?? parseLine(ing.text).qty, ing.unit) || 'one'}</span>}
                    {f.checkState && <span className="flag">Raw or cooked? Check the food</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <textarea
          className="input"
          rows={3}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Paste or type ingredients, one per line\ne.g. 30g (dry) lentils\n2 garlic cloves'}
          aria-label="Add ingredients"
        />
        <button className="btn" style={{ marginTop: 8 }} disabled={!paste.trim()} onClick={addLines}>
          <Icon name="plus" size={18} /> Add ingredients
        </button>
      </div>

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

      {picking && <FoodPicker ingredient={picking} onPick={(f) => pick(picking, f)} onClose={() => setPicking(null)} />}
    </Sheet>
  );
}
