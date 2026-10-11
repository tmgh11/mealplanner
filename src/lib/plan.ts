/**
 * Calendar and menu logic: weeks, who a meal is for, a meal's nutrition for one person,
 * putting a menu on the calendar, and saving days of the calendar as a menu.
 */
import { addDays, fromISO, toISO } from './dates';
import { emptyNutrients, perCookedGrams, perServing, recipeTotals, scale } from './nutrition';
import type { Food, Meal, MealBody, Menu, MenuDay, Nutrients, Person, Recipe, Slot, Who } from './types';
import { NUTRIENT_KEYS, SLOTS } from './types';

/** The Monday on or before a date. */
export function weekStart(date: string): string {
  const d = fromISO(date);
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - back);
  return toISO(d);
}

export const daysFrom = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));

export const peopleOf = (who: Who): Person[] => (who === 'both' ? ['tom', 'nuria'] : [who]);
const overlaps = (a: Who, b: Who) => a === 'both' || b === 'both' || a === b;

/** "Mon 12 Oct" */
export const dayLabel = (date: string) =>
  fromISO(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** "12 – 18 Oct" / "28 Sept – 4 Oct" */
export function rangeLabel(start: string, end: string): string {
  const a = fromISO(start);
  const b = fromISO(end);
  const sameMonth = a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString('en-GB', { day: 'numeric', month: sameMonth ? undefined : 'short' });
  return `${left} – ${b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export interface Lookup {
  recipe: (id: string) => Recipe | undefined;
  food: (id: string) => Food | undefined;
}

/** What one person eats from a meal, or null if it isn't theirs or has no numbers (a note). */
export function mealNutrition(meal: MealBody, person: Person, l: Lookup): { n: Nutrients; complete: boolean } | null {
  if (!peopleOf(meal.who).includes(person)) return null;
  const c = meal.content;
  if (c.type === 'note') return null;
  if (c.type === 'items') {
    const t = recipeTotals(c.ingredients, l.food);
    return { n: t.sum, complete: t.missing.length === 0 };
  }
  const r = l.recipe(c.recipeId);
  if (!r) return null;
  const t = recipeTotals(r.ingredients, l.food);
  const p = c.portions[person] ?? { servings: 1 };
  const byWeight = p.grams != null ? perCookedGrams(r, t, p.grams) : null;
  const n = byWeight ?? scale(perServing(r, t), p.servings ?? 1);
  return { n, complete: t.missing.length === 0 };
}

export interface DayTotal {
  sum: Nutrients;
  /** meals that have no numbers (notes) or are missing some ingredients */
  uncounted: number;
  meals: number;
}

export function dayTotal(meals: Meal[], person: Person, l: Lookup): DayTotal {
  const sum = emptyNutrients();
  let uncounted = 0;
  let count = 0;
  for (const m of meals) {
    if (!peopleOf(m.who).includes(person)) continue;
    count++;
    const r = mealNutrition(m, person, l);
    if (!r) {
      uncounted++;
      continue;
    }
    if (!r.complete) uncounted++;
    for (const k of NUTRIENT_KEYS) sum[k] = (sum[k] ?? 0) + (r.n[k] ?? 0);
  }
  return { sum, uncounted, meals: count };
}

// ---------- menus → calendar ----------

export interface ApplyOptions {
  start: string;
  days: number;
  /** whose meals to add: everyone's as the menu says, or one person's */
  forWho: Who;
  /** 'fill' leaves meals already planned alone; 'replace' swaps them for the menu's */
  mode: 'fill' | 'replace';
}

export interface ApplyPlan {
  add: Meal[];
  remove: Meal[];
  /** shared meals that now belong to just the other person */
  update: Meal[];
}

/** Every meal in the menu is for the same person (or all for both): it works as a template. */
export const isUniform = (menu: Menu) => new Set(menu.days.flatMap((d) => d.meals.map((m) => m.who))).size <= 1;

/**
 * The meals to add for `forWho`. A uniform menu is a template: every meal goes to `forWho`.
 * A mixed menu keeps its own who for 'both' ("as planned"), or gives one person their meals.
 */
function bodiesFor(day: MenuDay, forWho: Who, uniform: boolean): MealBody[] {
  if (uniform) return day.meals.map((m) => ({ ...m, who: forWho }));
  if (forWho === 'both') return day.meals;
  return day.meals.filter((m) => overlaps(m.who, forWho)).map((m) => ({ ...m, who: forWho }));
}

export function planApply(menu: Menu, o: ApplyOptions, existing: Map<string, Meal[]>, newId: () => string, me?: Person): ApplyPlan {
  const plan: ApplyPlan = { add: [], remove: [], update: [] };
  if (!menu.days.length || o.days < 1) return plan;
  const uniform = isUniform(menu);
  for (let i = 0; i < o.days; i++) {
    const date = addDays(o.start, i);
    const day = menu.days[i % menu.days.length];
    const bodies = bodiesFor(day, o.forWho, uniform);
    const before = existing.get(date) ?? [];
    let order = before.reduce((m, x) => Math.max(m, x.order), -1) + 1;
    for (const slot of SLOTS) {
      const incoming = bodies.filter((b) => b.slot === slot);
      if (!incoming.length) continue;
      const already = before.filter((m) => m.slot === slot);
      if (o.mode === 'replace') {
        const target = new Set(incoming.flatMap((b) => peopleOf(b.who)));
        for (const m of already) {
          const theirs = peopleOf(m.who);
          const left = theirs.filter((p) => !target.has(p));
          if (left.length === theirs.length) continue; // not affected
          if (left.length === 0) plan.remove.push(m);
          else plan.update.push({ ...m, who: left[0] });
        }
        for (const b of incoming) plan.add.push(toMeal(b, date, order++, menu.id, newId, me));
      } else {
        const busy = new Set(already.flatMap((m) => peopleOf(m.who)));
        for (const b of incoming) {
          const free = peopleOf(b.who).filter((p) => !busy.has(p));
          if (!free.length) continue;
          const who: Who = free.length === 2 ? 'both' : free[0];
          plan.add.push(toMeal({ ...b, who }, date, order++, menu.id, newId, me));
        }
      }
    }
  }
  return plan;
}

function toMeal(b: MealBody, date: string, order: number, menuId: string, newId: () => string, me?: Person): Meal {
  return { ...structuredClone(b), id: newId(), kind: 'meal', date, order, menuId, createdBy: me, updatedAt: 0 };
}

/** Days of the calendar → a menu's days (Day 1 = start). */
export function daysToMenu(existing: Map<string, Meal[]>, start: string, n: number, forWho: Who): MenuDay[] {
  return daysFrom(start, n).map((date) => ({
    meals: (existing.get(date) ?? [])
      .filter((m) => overlaps(m.who, forWho))
      .map(({ slot, who, content, label, leftovers }) => structuredClone({ slot, who: forWho === 'both' ? who : forWho, content, label, leftovers })),
  }));
}

export const countMeals = (days: MenuDay[]) => days.reduce((n, d) => n + d.meals.length, 0);

/** A meal's title for lists: the recipe name, the note, or the first items. */
export function mealTitle(m: MealBody, recipe: (id: string) => Recipe | undefined): string {
  const c = m.content;
  if (c.type === 'recipe') return recipe(c.recipeId)?.title ?? 'Deleted recipe';
  if (c.type === 'note') return c.text || 'Note';
  return c.ingredients.map((i) => i.text).join(', ') || 'Empty meal';
}

export const slotsOf = (meals: MealBody[], slot: Slot) => meals.filter((m) => m.slot === slot);
