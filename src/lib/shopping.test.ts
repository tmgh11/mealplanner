import { describe, expect, it } from 'vitest';
import { typedName, parseAmount, aisleOf, checkedGroups, fmtAmount, groupShopping, lineFor, linesForMeal, planFromCalendar, recipeFactor, shopName, toItem } from './shopping';
import { buildFoods, type CofidRow } from './foods';
import { resolveLine } from './ingredients';
import type { Meal, Recipe, ShopItem } from './types';
import cofid from '../../public/data/cofid.json';

const foods = buildFoods((cofid as unknown as { foods: CofidRow[] }).foods, []);
const byId = new Map(foods.map((f) => [f.id, f]));
const food = (name: string) => foods.find((f) => f.name === name)!;
const ing = (text: string) => resolveLine(text, foods).ingredient;

const recipe: Recipe = {
  id: 'r1', kind: 'recipe', title: 'Lentil stew', owner: 'both', servings: 4, method: '', tags: [], updatedAt: 1,
  ingredients: [ing('200g (dry) lentils'), ing('4 cloves garlic'), ing('2 tbsp olive oil'), ing('1 tin chopped tomatoes'), ing('salt to taste')],
};
recipe.ingredients[4].foodId = null;
const lookup = { recipe: (id: string) => (id === 'r1' ? recipe : undefined), food: (id: string) => byId.get(id) };

let n = 0;
const id = () => `i${++n}`;
const meal = (p: Partial<Meal> & Pick<Meal, 'content'>): Meal => ({ id: id(), kind: 'meal', date: '2026-10-15', slot: 'lunch', who: 'both', order: 0, updatedAt: 1, ...p });

describe('aisles', () => {
  it('sorts foods into supermarket aisles', () => {
    expect(aisleOf(food('Onions, raw'))).toBe('Fruit & veg');
    expect(aisleOf(food('Chicken, light meat, raw'))).toBe('Meat & fish');
    expect(aisleOf(food('Cheese, cottage, plain'))).toBe('Dairy, eggs & cheese');
    expect(aisleOf(food('Eggs, chicken, whole, raw'))).toBe('Dairy, eggs & cheese');
    expect(aisleOf(food('Lentils, red, split, dried, raw'))).toBe('Pasta, rice & tins');
    expect(aisleOf(food('Oil, olive'))).toBe('Herbs, spices & sauces');
    expect(aisleOf(food('Bread, wholemeal, average'))).toBe('Bakery');
    expect(aisleOf(food('Tuna, canned in brine, drained'))).toBe('Pasta, rice & tins');
    expect(aisleOf(undefined, 'oat milk')).toBe('Dairy, eggs & cheese');
    expect(aisleOf(undefined, 'kitchen roll')).toBe('Household & toiletries');
  });
  it.each([
    ['sandwich meat', 'Deli & chilled'],
    ['cooked chicken', 'Deli & chilled'],
    ['ham', 'Deli & chilled'],
    ['cat food', 'Pet'],
    ['cat litter', 'Pet'],
    ['ice cream', 'Frozen'],
    ['peanut butter', 'Breakfast & hot drinks'],
    ['hot chocolate', 'Breakfast & hot drinks'],
    ['dark chocolate', 'Snacks & sweets'],
    ['gluten free bread', 'Bakery'],
    ['gluten free pasta', 'Pasta, rice & tins'],
    ['coconut milk', 'Pasta, rice & tins'],
    ['soy sauce', 'Herbs, spices & sauces'],
    ['chicken stock cubes', 'Herbs, spices & sauces'],
    ['olive oil', 'Herbs, spices & sauces'],
    ['toothpaste', 'Household & toiletries'],
    ['bin bags', 'Household & toiletries'],
    ['sugar snap peas', 'Fruit & veg'],
    ['salad cream', 'Herbs, spices & sauces'],
    ['red wine', 'Drinks'],
    ['tofu', 'Deli & chilled'],
  ])('%s → %s', (name, aisle) => expect(aisleOf(undefined, name)).toBe(aisle));
});

describe('lines from ingredients', () => {
  it('keeps weights, counts, spoons and ml as people would buy them', () => {
    expect(lineFor(ing('120g chicken'), 2, food('Chicken, light meat, raw'))).toMatchObject({ name: 'Chicken', grams: 240, aisle: 'Meat & fish' });
    expect(lineFor(ing('4 cloves garlic'), 0.5, food('Garlic, raw'))).toMatchObject({ name: 'Garlic', qty: 2, unit: 'clove' });
    expect(lineFor(ing('10ml olive oil'), 2)).toMatchObject({ qty: 20, unit: 'ml' });
    expect(lineFor(ing('2 tbsp olive oil'), 1)).toMatchObject({ qty: 2, unit: 'tbsp' });
    expect(lineFor(ing('1/2 onion'), 2, food('Onions, raw'))).toMatchObject({ name: 'Onion', qty: 1, unit: 'each' });
    expect(lineFor(ing('boiled egg'), 2, food('Eggs, chicken, whole, boiled'))).toMatchObject({ name: 'Egg', qty: 2, unit: 'each' });
    expect(lineFor({ ...ing('x'), foodId: null }, 1)).toBeNull();
  });
});

describe('meals → lines', () => {
  it('scales a recipe by everyone’s portions', () => {
    expect(recipeFactor(recipe, {}, 'both')).toBe(0.5); // 2 servings of 4
    expect(recipeFactor({ ...recipe, cookedWeight: 1000 }, { tom: { grams: 300 }, nuria: { servings: 2 } }, 'both')).toBeCloseTo(0.3 + 0.5);
    const r = linesForMeal(meal({ content: { type: 'recipe', recipeId: 'r1', portions: {} } }), lookup);
    expect(r.lines.map((l) => [l.name, l.grams ?? l.qty, l.unit])).toEqual([
      ['Lentils', 100, undefined],
      ['Garlic', 2, 'clove'],
      ['Olive oil', 1, 'tbsp'],
      ['Chopped tomatoes', 0.5, 'tin'],
    ]);
    expect(r.source.label).toMatch(/lunch · Lentil stew$/);
  });
  it('doubles weighed items for both of you, and skips leftovers and notes', () => {
    const items = meal({ who: 'both', content: { type: 'items', ingredients: [ing('100g broccoli')] } });
    expect(linesForMeal(items, lookup).lines[0].grams).toBe(200);
    expect(linesForMeal({ ...items, who: 'nuria' }, lookup).lines[0].grams).toBe(100);
    expect(linesForMeal({ ...items, leftovers: true }, lookup).skip).toBe('leftovers');
    expect(linesForMeal(meal({ content: { type: 'note', text: 'Pizza night' } }), lookup).skip).toBe('note');
  });
});

describe('from the calendar', () => {
  const a = meal({ date: '2026-10-15', who: 'nuria', content: { type: 'items', ingredients: [ing('120g chicken'), ing('100g broccoli')] } });
  const b = meal({ date: '2026-10-16', who: 'tom', content: { type: 'items', ingredients: [ing('150g chicken')] } });
  const c = meal({ date: '2026-10-16', slot: 'dinner', who: 'both', content: { type: 'note', text: 'Out' } });
  const d = meal({ date: '2026-10-17', who: 'both', leftovers: true, content: { type: 'items', ingredients: [ing('1 tin tuna')] } });
  const cal = new Map([['2026-10-15', [a]], ['2026-10-16', [b, c]], ['2026-10-17', [d]]]);

  it('collects the days asked for, for whoever is chosen', () => {
    const all = planFromCalendar(cal, '2026-10-15', 3, 'both', [], lookup, 'nuria', id);
    expect(all.add.map((i) => i.name)).toEqual(['Chicken', 'Broccoli', 'Chicken']);
    expect([all.meals, all.notes, all.leftovers]).toEqual([2, 1, 1]);
    const hers = planFromCalendar(cal, '2026-10-15', 3, 'nuria', [], lookup, 'nuria', id);
    expect(hers.add.map((i) => i.grams)).toEqual([120, 100]);
    expect(hers.add[0]).toMatchObject({ addedBy: 'nuria', checked: false, source: { mealId: a.id, forWho: 'nuria' } });
  });
  it('doesn’t add a meal twice', () => {
    const first = planFromCalendar(cal, '2026-10-15', 3, 'both', [], lookup, 'tom', id);
    const again = planFromCalendar(cal, '2026-10-15', 3, 'both', first.add, lookup, 'tom', id);
    expect(again.add).toEqual([]);
    expect(again.already).toBe(2);
  });
});

describe('the list as shown', () => {
  const item = (p: Partial<ShopItem>, i = 0): ShopItem => ({ ...toItem({ name: 'x', aisle: 'Other' }, undefined, 'tom', id(), i), ...p });
  it('adds up amounts', () => {
    expect(fmtAmount([{ grams: 120 }, { grams: 150 }])).toBe('270 g');
    expect(fmtAmount([{ grams: 800 }, { grams: 450 }])).toBe('1.3 kg');
    expect(fmtAmount([{ qty: 4, unit: 'clove' }, { qty: 2, unit: 'clove' }])).toBe('6 cloves');
    expect(fmtAmount([{ grams: 200 }, { qty: 1, unit: 'tin' }])).toBe('200 g + 1 tin');
    expect(fmtAmount([{ qty: 1.5, unit: 'each' }])).toBe('1.5');
    expect(fmtAmount([{}])).toBe('');
  });
  it('shows the same food as one line, by aisle, with who added it', () => {
    const list = [
      item({ name: 'Chicken breast', foodId: 'c', grams: 120, aisle: 'Meat & fish', addedBy: 'nuria' }),
      item({ name: 'Chicken', foodId: 'c', grams: 150, aisle: 'Meat & fish', addedBy: 'tom' }),
      item({ name: 'Onion', foodId: 'o', qty: 1, unit: 'each', aisle: 'Fruit & veg' }),
      item({ name: 'Kitchen roll', aisle: 'Other' }),
      item({ name: 'kitchen roll', aisle: 'Other', checked: true }),
    ];
    const shown = groupShopping(list);
    expect(shown.map((a) => a.aisle)).toEqual(['Fruit & veg', 'Meat & fish', 'Other']);
    const chicken = shown[1].groups[0];
    expect([chicken.name, chicken.amount, chicken.items.length, chicken.addedBy]).toEqual(['Chicken', '270 g', 2, ['nuria', 'tom']]);
    expect(checkedGroups(list).map((g) => g.name)).toEqual(['kitchen roll']);
  });
});

describe('shopping names drop the preparation', () => {
  it.each([
    ['6 x sea bass fillets', 'Sea bass'],
    ['3 fat, fresh red chillies, deseeded and thinly shredded', 'Red chillies'],
    ['4 garlic cloves thinly sliced', 'Garlic'],
    ['1 red onion finely chopped', 'Red onion'],
    ['small bunch coriander roughly chopped', 'Coriander'],
    ['200g chicken breast, diced', 'Chicken breast'],
    ['2 large ripe avocados, halved and stoned', 'Avocados'],
    ['1 lemon, zested and juiced', 'Lemon'],
  ])('%s → %s', (text, want) => {
    expect(shopName(text)).toBe(want);
  });
});

describe('shopping names keep product names', () => {
  it.each([
    ['1 tin chopped tomatoes', 'Chopped tomatoes'],
    ['1 tsp ground cumin', 'Ground cumin'],
    ['Freshly ground black pepper', 'Ground black pepper'],
    ['finely chopped onion to serve', 'Onion'],
    ['1 heaped tbsp light brown soft sugar', 'Light brown soft sugar'],
    ['1 to 2 tablespoons lemon juice', 'Lemon juice'],
    ['2 skinless boneless chicken breasts, cut into strips', 'Skinless boneless chicken breasts'],
    ['1kg free-range chicken thighs', 'Free-range chicken thighs'],
    ['1 unwaxed lemon, zested', 'Unwaxed lemon'],
  ])('%s → %s', (text, want) => {
    expect(shopName(text)).toBe(want);
  });
});

describe('typing an amount on the list', () => {
  it.each([
    ['3', { qty: 3, unit: 'each' }],
    ['200g', { grams: 200 }],
    ['1.5 kg', { grams: 1500 }],
    ['2 tins', { qty: 2, unit: 'tin' }],
    ['500 ml', { qty: 500, unit: 'ml' }],
    ['1 l', { qty: 1000, unit: 'ml' }],
    ['4 cloves', { qty: 4, unit: 'clove' }],
  ])('%s', (t, want) => expect(parseAmount(t)).toMatchObject(want));
  it('empty clears it; nonsense is refused', () => {
    expect(parseAmount('')).toEqual({ grams: undefined, qty: undefined, unit: undefined });
    expect(parseAmount('lots')).toBeNull();
    expect(parseAmount('3 apples')).toBeNull();
  });
  it('reads back what the list shows', () => {
    for (const i of [{ qty: 3, unit: 'each' }, { grams: 1100 }, { qty: 2, unit: 'tin' }, { qty: 1500, unit: 'ml' }]) {
      expect(fmtAmount([parseAmount(fmtAmount([i]))!])).toBe(fmtAmount([i]));
    }
  });
});

describe('typed items keep their wording', () => {
  it.each([
    ['breakfast for mum and dad', 'Breakfast for mum and dad'],
    ['3 tomatoes', 'Tomatoes'],
    ['2 tins chopped tomatoes, drained', 'Chopped tomatoes, drained'],
    ['500g beef mince (lean)', 'Beef mince (lean)'],
    ['milk', 'Milk'],
  ])('%s → %s', (t, want) => expect(typedName(t)).toBe(want));
});

describe('aisles: things that tripped up the first version', () => {
  it.each([
    ['butternut squash', 'Fruit & veg'],
    ['orange squash', 'Drinks'],
    ['lemon juice', 'Fruit & veg'],
    ['orange juice', 'Drinks'],
    ['rice wine vinegar', 'Herbs, spices & sauces'],
    ['garlic cloves', 'Fruit & veg'],
    ['black beans', 'Pasta, rice & tins'],
    ['cumin seeds', 'Herbs, spices & sauces'],
    ['sesame seeds', 'Baking'],
    ['black peppercorns', 'Herbs, spices & sauces'],
    ['red peppers', 'Fruit & veg'],
  ])('%s → %s', (name, aisle) => expect(aisleOf(undefined, name)).toBe(aisle));
});
