import { useMemo, useState } from 'react';
import { Icon, Seg, Sheet, Toggle } from './ui';
import { IngredientsEditor } from './IngredientsEditor';
import { Macros } from './Nutrition';
import { useTracking } from './RecipesView';
import { WhoTag } from './WhoSwitch';
import { useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { dayLabel, mealNutrition, peopleOf } from '../lib/plan';
import { SLOT_LABELS, SLOTS, visibleIn, type MealBody, type MealContent, type Person, type Portion1, type Recipe, type Slot, type Who } from '../lib/types';

type Kind = MealContent['type'];

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Add or edit one meal: what it is (a recipe, a list of weighed items, or a note), who it's for,
 * which meal of the day, and each person's portion. Used by the calendar (with a date) and by menus.
 */
export function MealEditor({
  initial,
  date,
  dayName,
  onSave,
  onDelete,
  onClose,
}: {
  initial: MealBody;
  /** calendar meals can move day */
  date?: string;
  /** shown in the title for menu meals, e.g. "Day 3" */
  dayName?: string;
  onSave: (m: MealBody, date?: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { settings, recipes } = useStore();
  const foods = useFoods();
  const tracking = useTracking();
  const [m, setM] = useState<MealBody>(initial);
  const [d, setD] = useState(date);
  const [choosing, setChoosing] = useState(false);
  const [orig] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(m) !== orig || d !== date;

  // keep each content type's work if they switch back and forth
  const [drafts, setDrafts] = useState<Partial<Record<Kind, MealContent>>>({ [initial.content.type]: initial.content });
  const setContent = (content: MealContent) => {
    setM((x) => ({ ...x, content }));
    setDrafts((x) => ({ ...x, [content.type]: content }));
  };
  const switchKind = (k: Kind) => {
    if (k === m.content.type) return;
    const keep = drafts[k];
    if (keep) setM((x) => ({ ...x, content: keep }));
    else if (k === 'items') setContent({ type: 'items', ingredients: [] });
    else if (k === 'note') setContent({ type: 'note', text: '' });
    else setChoosing(true);
  };

  const recipe = m.content.type === 'recipe' ? recipes.find((r) => r.id === (m.content as { recipeId: string }).recipeId) : undefined;
  const people = peopleOf(m.who);
  const lookup = useMemo(() => ({ recipe: (id: string) => recipes.find((r) => r.id === id), food: foods.get }), [recipes, foods]);

  const setPortion = (p: Person, portion: Portion1) => {
    if (m.content.type !== 'recipe') return;
    setContent({ ...m.content, portions: { ...m.content.portions, [p]: portion } });
  };

  const canSave = m.content.type === 'recipe' ? Boolean(recipe) : m.content.type === 'note' ? m.content.text.trim() !== '' : m.content.ingredients.length > 0;

  const save = () => {
    const clean: MealBody = { ...m, label: m.label?.trim() || undefined, leftovers: m.leftovers || undefined };
    if (clean.content.type === 'note') clean.content = { type: 'note', text: clean.content.text.trim() };
    onSave(clean, d);
    onClose();
  };

  const whoName = m.who === 'both' ? 'both of you' : settings.names[m.who];
  const where = d ? `${dayLabel(d)} ${SLOT_LABELS[m.slot].toLowerCase()}` : `${dayName ?? 'the menu'}, ${SLOT_LABELS[m.slot].toLowerCase()}`;

  return (
    <Sheet
      title={onDelete ? 'Edit meal' : 'Add a meal'}
      onClose={onClose}
      full
      dirty={dirty}
      footer={
        <div className="btn-row">
          {onDelete && (
            <button className="btn delete" onClick={() => { onDelete(); onClose(); }} aria-label="Delete meal">
              <Icon name="trash" size={20} />
            </button>
          )}
          <button className="btn primary save" disabled={!canSave} onClick={save}>
            <span>{onDelete ? 'Save' : 'Add'} for {whoName}</span>
            <span className="save-sub">{where}</span>
          </button>
        </div>
      }
    >
      <div className="field">
        <span className="field-label">Who it’s for</span>
        <Seg<Who>
          value={m.who}
          onChange={(who) => setM({ ...m, who })}
          options={[
            { value: 'tom', label: settings.names.tom, className: 'tom' },
            { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>

      <div className="field">
        <span className="field-label">Meal</span>
        <Seg<Slot> value={m.slot} onChange={(slot) => setM({ ...m, slot })} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }))} />
      </div>

      {date !== undefined && (
        <div className="field">
          <label htmlFor="md">Day</label>
          <input id="md" type="date" className="input" value={d} onChange={(e) => e.target.value && setD(e.target.value)} />
        </div>
      )}

      <div className="field">
        <span className="field-label">What it is</span>
        <Seg<Kind>
          value={m.content.type}
          onChange={switchKind}
          options={[
            { value: 'recipe', label: 'Recipe' },
            { value: 'items', label: 'Weighed items' },
            { value: 'note', label: 'Just a note' },
          ]}
        />
      </div>

      {m.content.type === 'recipe' && (
        <>
          <button className="card pad pick-recipe" onClick={() => setChoosing(true)}>
            <span className="grow">
              <span className="row-title">{recipe?.title ?? 'Choose a recipe'}</span>
              {recipe && <span className="row-sub">Serves {recipe.servings}{recipe.cookedWeight ? ` · ${recipe.cookedWeight} g cooked` : ''}</span>}
            </span>
            <Icon name="right" size={18} />
          </button>
          {recipe && (
            <div className="card set-group" style={{ marginTop: 10 }}>
              {people.map((p) => (
                <PortionRow
                  key={p}
                  name={settings.names[p]}
                  person={p}
                  recipe={recipe}
                  value={(m.content as { portions: Partial<Record<Person, Portion1>> }).portions[p] ?? { servings: 1 }}
                  onChange={(v) => setPortion(p, v)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {m.content.type === 'items' && (
        <>
          <p className="small-print" style={{ marginTop: -6 }}>Amounts are for one person; {m.who === 'both' ? 'each of you has this.' : 'add a separate meal for the other person if theirs differs.'}</p>
          <IngredientsEditor
            ingredients={m.content.ingredients}
            onChange={(ingredients) => setContent({ type: 'items', ingredients })}
            placeholder={'e.g. 120g chicken, 100g broccoli, 7.5ml olive oil\n(commas or one per line)'}
            commas
          />
        </>
      )}

      {m.content.type === 'note' && (
        <div className="field">
          <textarea
            className="input"
            rows={2}
            value={m.content.text}
            onChange={(e) => {
              setContent({ type: 'note', text: e.target.value });
              // "Leftover curry", "Leftovers": nothing to buy
              if (/^leftovers?\b/i.test(e.target.value) && !/^leftovers?\b/i.test((m.content as { text: string }).text)) setM((x) => ({ ...x, leftovers: true }));
            }}
            placeholder="e.g. Pizza night, Out in town"
            aria-label="Note"
          />
        </div>
      )}

      <div className="card set-group" style={{ marginTop: 14 }}>
        <div className="set-row toggle-row">
          <span className="grow">
            <div style={{ fontWeight: 600 }}>Leftovers</div>
            <div className="hint">Cooked earlier, so nothing to buy for it</div>
          </span>
          <Toggle checked={Boolean(m.leftovers)} onChange={(leftovers) => setM({ ...m, leftovers })} label="Leftovers" />
        </div>
      </div>

      {tracking && m.content.type !== 'note' && (
        <div className="card pad nutri">
          {people.map((p) => {
            const r = mealNutrition(m, p, lookup);
            return (
              <div key={p} style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 6 }}><WhoTag who={p} /></div>
                {r ? <Macros n={r.n} small /> : <p className="small-print">No numbers yet</p>}
              </div>
            );
          })}
        </div>
      )}

      {choosing && (
        <RecipeChooser
          who={m.who}
          onPick={(r) => {
            setContent({ type: 'recipe', recipeId: r.id, portions: {} });
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </Sheet>
  );
}

function PortionRow({ name, person, recipe, value, onChange }: { name: string; person: Person; recipe: Recipe; value: Portion1; onChange: (v: Portion1) => void }) {
  const byWeight = value.grams != null;
  return (
    <div className="set-row" style={{ gap: 10, flexWrap: 'wrap' }}>
      <strong className={person} style={{ width: 64 }}>{name}</strong>
      <span className="grams" style={{ flex: 1 }}>
        <input
          inputMode="decimal"
          value={byWeight ? value.grams ?? '' : value.servings ?? ''}
          onChange={(e) => onChange(byWeight ? { grams: num(e.target.value) ?? 0 } : { servings: num(e.target.value) ?? 0 })}
          aria-label={`${name}'s portion`}
        />
        {byWeight ? 'g of the cooked dish' : `serving${value.servings === 1 ? '' : 's'}`}
      </span>
      {recipe.cookedWeight ? (
        <button className="btn small" onClick={() => onChange(byWeight ? { servings: 1 } : { grams: Math.round(recipe.cookedWeight! / Math.max(1, recipe.servings)) })}>
          {byWeight ? 'Use servings' : 'Weigh it'}
        </button>
      ) : null}
    </div>
  );
}

/** Pick a recipe: the ones visible for who the meal is for come first. */
export function RecipeChooser({ who, onPick, onClose }: { who: Who; onPick: (r: Recipe) => void; onClose: () => void }) {
  const { recipes } = useStore();
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = recipes
    .filter((r) => words.every((w) => r.title.toLowerCase().includes(w) || r.tags.some((t) => t.toLowerCase().includes(w))))
    .sort((a, b) => Number(visibleIn(b.owner, who)) - Number(visibleIn(a.owner, who)));
  return (
    <Sheet title="Choose a recipe" onClose={onClose} full>
      <label className="search" style={{ marginTop: 0 }}>
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" />
      </label>
      {list.length ? (
        <div className="card list">
          {list.map((r) => (
            <button key={r.id} className="row" onClick={() => onPick(r)}>
              <span className="row-main">
                <span className="row-title">{r.title}</span>
                <span className="row-sub">Serves {r.servings}{r.tags.length ? ` · ${r.tags.join(', ')}` : ''}</span>
              </span>
              <span className="row-amt"><WhoTag who={r.owner} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">{recipes.length ? 'No recipes match.' : 'No recipes yet. Add some in the Recipes tab, or use “Weighed items” instead.'}</div>
      )}
    </Sheet>
  );
}
