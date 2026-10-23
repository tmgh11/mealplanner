import { useEffect, useMemo, useState } from 'react';
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
import { fetchWebRecipe, FetchProblem } from '../lib/fetchRecipe';
import { findUrl, webToRecipe } from '../lib/recipeWeb';
import { fmtMinutes, parseMinutes } from '../lib/times';

function blank(owner: Who): Recipe {
  return { id: newId(), kind: 'recipe', title: '', owner, servings: 2, ingredients: [], method: '', tags: [], updatedAt: 0 };
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

export function RecipeEditor({
  initial,
  draft,
  link,
  onClose,
  onOpenOther,
}: {
  initial?: Recipe;
  draft?: Recipe;
  /** a recipe link to read straight away (shared into the app) */
  link?: string;
  onClose: () => void;
  /** open a recipe that's already saved (when the link is one we have) */
  onOpenOther?: (r: Recipe) => void;
}) {
  const { settings, device, recipes } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [r, setR] = useState<Recipe>(() => initial ?? draft ?? { ...blank(view), createdBy: device.me });
  const [tags, setTags] = useState(((initial ?? draft)?.tags ?? []).join(', '));
  const [orig] = useState(r);
  const dirty = JSON.stringify(r) !== JSON.stringify(orig) || tags !== (initial?.tags ?? []).join(', ');

  const set = (patch: Partial<Recipe>) => setR((x) => ({ ...x, ...patch }));

  // ---- a new recipe can be read from a website: paste its link and the form fills itself in
  const [url, setUrl] = useState(link ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FetchProblem | null>(null);
  const [filled, setFilled] = useState<{ site?: string; matched: number; lines: number } | null>(null);
  const already = recipes.find((x) => x.importId && x.importId === r.importId && x.id !== r.id);
  const getRecipe = async (raw = url) => {
    const u = findUrl(raw);
    if (!u) return setProblem(new FetchProblem('That doesn’t look like a web address. Copy the link from the recipe page.', 'site'));
    if (!foods.ready) return toast('The food list is still loading — try again in a moment');
    setBusy(true);
    setProblem(null);
    try {
      const w = await fetchWebRecipe(u);
      const made = webToRecipe(w, r.owner, foods.foods, device.me, newId);
      setR((x) => ({ ...made, id: x.id, owner: x.owner, createdBy: x.createdBy }));
      setTags(made.tags.join(', '));
      const lines = made.ingredients.filter((i) => !i.heading);
      setFilled({ site: w.site, matched: lines.filter((i) => i.foodId !== undefined).length, lines: lines.length });
    } catch (e) {
      setProblem(e instanceof FetchProblem ? e : new FetchProblem(e instanceof Error ? e.message : 'Couldn’t read that page.', 'site'));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (link && foods.ready) void getRecipe(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, foods.ready]);

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
      {!initial && !filled && (
        <div className="field link-field">
          <label htmlFor="ru0">From a website</label>
          <form
            className="link-row"
            onSubmit={(e) => {
              e.preventDefault();
              void getRecipe();
            }}
          >
            <input
              id="ru0"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste the recipe’s link"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="go"
            />
            <button className="btn primary small" type="submit" disabled={busy || !url.trim()}>
              {busy ? 'Reading…' : 'Get recipe'}
            </button>
          </form>
          {problem ? (
            <div className="note problem">
              <Icon name="alert" size={20} />
              <span>
                {problem.message}
                {problem.kind === 'not-set-up' && <> See “Recipe reader” in the README.</>}
                {(problem.kind === 'no-recipe' || problem.kind === 'site') && <> You can type it in below instead.</>}
              </span>
            </div>
          ) : (
            <p className="small-print" style={{ margin: '6px 2px 0' }}>Or leave this empty and type the recipe in below.</p>
          )}
        </div>
      )}
      {filled && (
        <div className="note" style={{ marginBottom: 14 }}>
          Filled in from {filled.site ?? 'the website'}. {filled.matched} of {filled.lines} ingredients matched to UK food data
          {filled.matched < filled.lines ? '; you can pick foods for the rest below' : ''}. Check it over, then save.
        </div>
      )}
      {already && (
        <div className="note problem" style={{ marginBottom: 14 }}>
          <Icon name="alert" size={20} />
          <span>
            You’ve already saved this recipe as “{already.title}”.{' '}
            {onOpenOther && (
              <button className="link-btn small" onClick={() => onOpenOther(already)}>Open that one</button>
            )}
          </span>
        </div>
      )}
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
      <div className="inline times">
        <TimeField id="tp" label="Prep" value={r.prepMins} onChange={(prepMins) => set({ prepMins })} />
        <TimeField id="tc" label="Cook" value={r.cookMins} onChange={(cookMins) => set({ cookMins })} />
        <TimeField
          id="tt"
          label="Total"
          value={r.totalMins}
          onChange={(totalMins) => set({ totalMins })}
          placeholder={r.prepMins || r.cookMins ? fmtMinutes((r.prepMins ?? 0) + (r.cookMins ?? 0)) : 'optional'}
        />
      </div>

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
        <textarea id="rm" className="input" rows={6} value={r.method} onChange={(e) => set({ method: e.target.value })} placeholder={'Leave a blank line between steps.\n\n_For the sauce_ (underscores) makes a heading.'} />
          <p className="small-print" style={{ margin: '6px 2px 0' }}>Leave a blank line between steps. Put a heading between underscores, like _For the sauce_.</p>
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

/** A time typed as "40", "40 min" or "1 hr 15": kept as minutes, shown as "1 hr 15 min". */
function TimeField({ id, label, value, onChange, placeholder = 'optional' }: { id: string; label: string; value?: number; onChange: (m?: number) => void; placeholder?: string }) {
  const [text, setText] = useState(fmtMinutes(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmtMinutes(value));
  }, [value, focused]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMinutes(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          setText(fmtMinutes(parseMinutes(text)));
        }}
        aria-label={`${label} time`}
      />
    </div>
  );
}
