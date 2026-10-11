import { describe, expect, it } from 'vitest';
import { daysToMenu, dayTotal, mealNutrition, planApply, rangeLabel, weekStart } from './plan';
import type { Food, Meal, MealBody, Menu, Recipe } from './types';

const food = (id: string, kcal: number): Food => ({
  id, name: id, group: 'x', portions: [], source: 'cofid',
  per100: { kcal, protein: 10, carbs: 10, fat: 1, fibre: 0, sugars: 0, salt: 0 },
});
const foods = new Map([['rice', food('rice', 350)], ['chicken', food('chicken', 100)]]);
const recipe: Recipe = {
  id: 'r1', kind: 'recipe', title: 'Rice and chicken', owner: 'both', servings: 2, cookedWeight: 800, method: '', tags: [], updatedAt: 1,
  ingredients: [
    { id: 'a', text: '200g rice', foodId: 'rice', grams: 200 },
    { id: 'b', text: '400g chicken', foodId: 'chicken', grams: 400 },
  ],
};
const lookup = { recipe: (id: string) => (id === 'r1' ? recipe : undefined), food: (id: string) => foods.get(id) };

let n = 0;
const id = () => `m${++n}`;
const meal = (date: string, body: MealBody, order = 0): Meal => ({ ...body, id: id(), kind: 'meal', date, order, updatedAt: 1 });

describe('weeks', () => {
  it('starts on Monday', () => {
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // a Sunday
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // a Monday
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
  });
  it('labels ranges', () => {
    expect(rangeLabel('2026-10-12', '2026-10-18')).toBe('12 – 18 Oct');
    expect(rangeLabel('2026-09-28', '2026-10-04')).toMatch(/28 Sept? – 4 Oct/);
  });
});

describe('meal nutrition per person', () => {
  const total = 2 * 350 + 4 * 100; // 1100 kcal in the pot
  it('uses servings, or grams of the cooked dish', () => {
    const m: MealBody = { slot: 'dinner', who: 'both', content: { type: 'recipe', recipeId: 'r1', portions: { tom: { servings: 1 }, nuria: { grams: 200 } } } };
    expect(mealNutrition(m, 'tom', lookup)!.n.kcal).toBeCloseTo(total / 2);
    expect(mealNutrition(m, 'nuria', lookup)!.n.kcal).toBeCloseTo((total * 200) / 800);
  });
  it('is nothing for someone else’s meal or a note', () => {
    const mine: MealBody = { slot: 'lunch', who: 'tom', content: { type: 'items', ingredients: [{ id: 'x', text: '100g rice', foodId: 'rice', grams: 100 }] } };
    expect(mealNutrition(mine, 'nuria', lookup)).toBeNull();
    expect(mealNutrition(mine, 'tom', lookup)!.n.kcal).toBe(350);
    expect(mealNutrition({ slot: 'dinner', who: 'both', content: { type: 'note', text: 'Pizza night' } }, 'tom', lookup)).toBeNull();
  });
  it('adds up a day and counts what it couldn’t', () => {
    const meals = [
      meal('2026-10-12', { slot: 'lunch', who: 'nuria', content: { type: 'items', ingredients: [{ id: 'x', text: '100g rice', foodId: 'rice', grams: 100 }] } }),
      meal('2026-10-12', { slot: 'dinner', who: 'both', content: { type: 'note', text: 'Out in town' } }),
      meal('2026-10-12', { slot: 'dinner', who: 'tom', content: { type: 'items', ingredients: [{ id: 'y', text: '100g chicken', foodId: 'chicken', grams: 100 }] } }),
    ];
    const t = dayTotal(meals, 'nuria', lookup);
    expect(t.sum.kcal).toBe(350);
    expect(t.meals).toBe(2);
    expect(t.uncounted).toBe(1);
  });
});

describe('adding a menu to the calendar', () => {
  const body = (slot: MealBody['slot'], who: MealBody['who'], text: string): MealBody => ({ slot, who, content: { type: 'note', text } });
  const menu: Menu = {
    id: 'menu1', kind: 'menu', name: 'Week 1', owner: 'both', updatedAt: 1,
    days: [
      { meals: [body('breakfast', 'nuria', 'Toast'), body('lunch', 'both', 'Lentils'), body('dinner', 'both', 'Fish')] },
      { meals: [body('breakfast', 'nuria', 'Egg'), body('dinner', 'tom', 'Pizza')] },
      { meals: [body('lunch', 'both', 'Salad')] },
    ],
  };
  const titles = (ms: Meal[]) => ms.map((m) => `${m.date.slice(8)} ${m.slot} ${m.who} ${(m.content as { text: string }).text}`);

  it('uses the first x days, or repeats a short menu', () => {
    const two = planApply(menu, { start: '2026-10-12', days: 2, forWho: 'both', mode: 'fill' }, new Map(), id);
    expect(titles(two.add)).toEqual(['12 breakfast nuria Toast', '12 lunch both Lentils', '12 dinner both Fish', '13 breakfast nuria Egg', '13 dinner tom Pizza']);
    const five = planApply(menu, { start: '2026-10-12', days: 5, forWho: 'both', mode: 'fill' }, new Map(), id);
    expect(five.add.filter((m) => m.date === '2026-10-15').map((m) => (m.content as { text: string }).text)).toEqual(['Toast', 'Lentils', 'Fish']);
    expect(five.add.every((m) => m.menuId === 'menu1')).toBe(true);
  });

  it('can add one person’s meals only', () => {
    const p = planApply(menu, { start: '2026-10-12', days: 2, forWho: 'tom', mode: 'fill' }, new Map(), id);
    expect(titles(p.add)).toEqual(['12 lunch tom Lentils', '12 dinner tom Fish', '13 dinner tom Pizza']);
  });

  it('fills only empty slots, per person', () => {
    const existing = new Map([['2026-10-12', [meal('2026-10-12', body('dinner', 'tom', 'Takeaway'))]]]);
    const p = planApply(menu, { start: '2026-10-12', days: 1, forWho: 'both', mode: 'fill' }, existing, id);
    expect(titles(p.add)).toEqual(['12 breakfast nuria Toast', '12 lunch both Lentils', '12 dinner nuria Fish']);
    expect(p.remove).toEqual([]);
  });

  it('replaces what was planned, keeping the other person’s half of a shared meal', () => {
    const shared = meal('2026-10-12', body('lunch', 'both', 'Soup'));
    const hers = meal('2026-10-12', body('dinner', 'nuria', 'Omelette'));
    const existing = new Map([['2026-10-12', [shared, hers]]]);
    const p = planApply(menu, { start: '2026-10-12', days: 1, forWho: 'tom', mode: 'replace' }, existing, id);
    expect(p.update.map((m) => `${m.slot} ${m.who}`)).toEqual(['lunch nuria']);
    expect(p.remove).toEqual([]);
    expect(titles(p.add)).toEqual(['12 lunch tom Lentils', '12 dinner tom Fish']);
    const all = planApply(menu, { start: '2026-10-12', days: 1, forWho: 'both', mode: 'replace' }, existing, id);
    expect(all.remove.map((m) => m.id).sort()).toEqual([shared.id, hers.id].sort());
  });
});

describe('a menu that is all one person’s works as a template', () => {
  const hers: Menu = {
    id: 'm2', kind: 'menu', name: 'Week 1', owner: 'nuria', updatedAt: 1,
    days: [{ meals: [{ slot: 'lunch', who: 'nuria', content: { type: 'note', text: 'Lentils' } }, { slot: 'dinner', who: 'nuria', content: { type: 'note', text: 'Fish' } }] }],
  };
  it('gives every meal to whoever it is added for', () => {
    expect(planApply(hers, { start: '2026-10-12', days: 1, forWho: 'both', mode: 'fill' }, new Map(), id).add.map((m) => m.who)).toEqual(['both', 'both']);
    expect(planApply(hers, { start: '2026-10-12', days: 1, forWho: 'tom', mode: 'fill' }, new Map(), id).add.map((m) => m.who)).toEqual(['tom', 'tom']);
  });
});

describe('saving days as a menu', () => {
  it('copies the days in order, for everyone or one person', () => {
    const existing = new Map([
      ['2026-10-12', [meal('2026-10-12', { slot: 'lunch', who: 'both', content: { type: 'note', text: 'A' } }), meal('2026-10-12', { slot: 'dinner', who: 'nuria', content: { type: 'note', text: 'B' } })]],
      ['2026-10-14', [meal('2026-10-14', { slot: 'lunch', who: 'tom', content: { type: 'note', text: 'C' }, label: 'Legume Day' })]],
    ]);
    const days = daysToMenu(existing, '2026-10-12', 3, 'both');
    expect(days.map((d) => d.meals.length)).toEqual([2, 0, 1]);
    expect(days[2].meals[0]).toMatchObject({ who: 'tom', label: 'Legume Day' });
    const toms = daysToMenu(existing, '2026-10-12', 3, 'tom');
    expect(toms[0].meals.map((m) => m.who)).toEqual(['tom']);
  });
});
