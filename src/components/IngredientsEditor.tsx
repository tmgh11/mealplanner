import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, MoreMenu, toast } from './ui';
import { FoodPicker } from './FoodPicker';
import { useFoods } from '../lib/useFoods';
import { flags, newIngredientId, regram, resolveLine } from '../lib/ingredients';
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
  const remove = (id: string) => onChange(ingredients.filter((x) => x.id !== id));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ingredients.length || from === to) return;
    const next = [...ingredients];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };
  const [newHeading, setNewHeading] = useState<string | null>(null);
  const headingAbove = (index: number) => {
    const h: Ingredient = { id: newIngredientId(), text: '', foodId: null, heading: true };
    const next = [...ingredients];
    next.splice(index, 0, h);
    onChange(next);
    setNewHeading(h.id);
  };

  // dragging a row by its handle: the list reorders live as the finger passes other rows
  const listRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const latest = useRef(ingredients);
  latest.current = ingredients;
  const startDrag = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    setDragging(id);
    const scroller = listRef.current?.closest('.sheet-body') as HTMLElement | null;
    let lastY = e.clientY;
    let raf = 0;
    const place = () => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-ing]') ?? [])];
      const list = latest.current;
      const from = list.findIndex((x) => x.id === id);
      let to = 0;
      for (const row of rows) {
        if (row.dataset.ing === id) continue;
        const r = row.getBoundingClientRect();
        if (lastY > r.top + r.height / 2) to++;
      }
      if (from >= 0 && to !== from) {
        const next = [...list];
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        latest.current = next;
        onChange(next);
      }
    };
    // near the top or bottom of the sheet: keep scrolling while the finger is held there
    const edgeScroll = () => {
      if (scroller) {
        const b = scroller.getBoundingClientRect();
        const step = lastY < b.top + 60 ? -8 : lastY > b.bottom - 60 ? 8 : 0;
        if (step) {
          scroller.scrollTop += step;
          place();
        }
      }
      raf = requestAnimationFrame(edgeScroll);
    };
    raf = requestAnimationFrame(edgeScroll);
    // listen on the window: the row (and its handle) moves around the page as the list reorders
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      lastY = ev.clientY;
      place();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const rowMenu = (ing: Ingredient, index: number) => (
    <MoreMenu
      small
      label={`Options for ${ing.text || 'heading'}`}
      items={[
        ...(ing.heading ? [] : [{ label: 'Add a heading above', icon: 'heading' as const, run: () => headingAbove(index) }]),
        ...(index > 0 ? [{ label: 'Move up', icon: 'up' as const, run: () => move(index, index - 1) }] : []),
        ...(index < ingredients.length - 1 ? [{ label: 'Move down', icon: 'down' as const, run: () => move(index, index + 1) }] : []),
        { label: ing.heading ? 'Remove heading' : 'Remove', icon: 'trash', danger: true, run: () => remove(ing.id) },
      ]}
    />
  );
  const grip = (ing: Ingredient) => (
    <span className="grip" onPointerDown={(e) => startDrag(e, ing.id)} aria-label={`Drag to move ${ing.text || 'heading'}`} role="button" tabIndex={-1}>
      <Icon name="grip" size={18} />
    </span>
  );

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
        <div className={`card ing-list${dragging ? ' is-dragging' : ''}`} ref={listRef}>
          {ingredients.map((ing, index) => {
            if (ing.heading) {
              return (
                <div key={ing.id} data-ing={ing.id} className={`ing ing-row ing-head-row${dragging === ing.id ? ' dragging' : ''}`}>
                  {grip(ing)}
                  <input
                    className="ing-heading-input"
                    value={ing.text}
                    autoFocus={newHeading === ing.id}
                    onChange={(e) => setIng(ing.id, { text: e.target.value })}
                    onBlur={() => setNewHeading(null)}
                    placeholder="Heading, e.g. For the sauce"
                    aria-label="Heading"
                    enterKeyHint="done"
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                  />
                  {rowMenu(ing, index)}
                </div>
              );
            }
            const food = ing.foodId ? foods.get(ing.foodId) : undefined;
            const f = flags(ing, food);
            return (
              <div key={ing.id} data-ing={ing.id} className={`ing ing-row${dragging === ing.id ? ' dragging' : ''}`}>
                {grip(ing)}
                <div className="ing-body">
                  <div className="ing-top">
                    <span className="ing-text">{ing.text}</span>
                    {rowMenu(ing, index)}
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
              </div>
            );
          })}
        </div>
      )}
      {ingredients.length > 1 && <p className="small-print" style={{ margin: '8px 4px 0' }}>Drag <Icon name="grip" size={14} /> to reorder. Use ⋯ to add a heading like “For the sauce” above an ingredient.</p>}

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
