import { useState } from 'react';
import { Icon, toast } from './ui';
import { FoodPicker } from './FoodPicker';
import { useFoods } from '../lib/useFoods';
import { flags, regram, resolveLine } from '../lib/ingredients';
import { formatQty, parseLine, splitRecipeIngredients } from '../lib/parse';
import type { Food, Ingredient } from '../lib/types';

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A list of ingredient lines, each matched to a food with its grams, plus a box to paste more. */
export function IngredientsEditor({
  ingredients,
  onChange,
  placeholder = 'Paste or type ingredients, one per line\ne.g. 30g (dry) lentils\n2 garlic cloves',
  commas = false,
}: {
  ingredients: Ingredient[];
  onChange: (list: Ingredient[]) => void;
  placeholder?: string;
  /** also split on commas (Nuria-style lists) */
  commas?: boolean;
}) {
  const foods = useFoods();
  const [paste, setPaste] = useState('');
  const [picking, setPicking] = useState<Ingredient | null>(null);

  const setIng = (id: string, patch: Partial<Ingredient>) => onChange(ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addLines = () => {
    const lines = commas ? splitRecipeIngredients(paste.replace(/\n/g, ', ')) : splitRecipeIngredients(paste);
    if (!lines.length) return;
    if (!foods.ready) return toast('The food list is still loading — try again in a moment');
    onChange([...ingredients, ...lines.map((l) => resolveLine(l, foods.foods).ingredient)]);
    setPaste('');
  };

  const pick = (ing: Ingredient, food: Food | 'not-food') => {
    if (food === 'not-food') setIng(ing.id, { foodId: null, grams: undefined, gramsSetByHand: undefined });
    else {
      const next = regram(ing, food);
      setIng(ing.id, ing.gramsSetByHand ? { foodId: next.foodId } : { foodId: next.foodId, grams: next.grams });
    }
    setPicking(null);
  };

  return (
    <>
      {ingredients.length > 0 && (
        <div className="card ing-list">
          {ingredients.map((ing) => {
            const food = ing.foodId ? foods.get(ing.foodId) : undefined;
            const f = flags(ing, food);
            return (
              <div key={ing.id} className="ing">
                <div className="ing-top">
                  <span className="ing-text">{ing.text}</span>
                  <button className="icon-btn small" onClick={() => onChange(ingredients.filter((x) => x.id !== ing.id))} aria-label={`Remove ${ing.text}`}>
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
        <textarea className="input" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={placeholder} aria-label="Add ingredients" />
        <button className="btn" style={{ marginTop: 8 }} disabled={!paste.trim()} onClick={addLines}>
          <Icon name="plus" size={18} /> Add ingredients
        </button>
      </div>

      {picking && <FoodPicker ingredient={picking} onPick={(f) => pick(picking, f)} onClose={() => setPicking(null)} />}
    </>
  );
}
