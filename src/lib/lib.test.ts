import { describe, expect, it } from 'vitest';
import { formatQty, parseLine, splitItems, splitRecipeIngredients } from './parse';
import { buildFoods, cofidId, findFoods, searchFoods, type CofidRow } from './foods';
import { kcalPer100Cooked, perCookedGrams, perServing, recipeTotals, toGrams } from './nutrition';
import { resolveLine } from './ingredients';
import { visibleIn, type FoodEntry } from './types';
import cofid from '../../public/data/cofid.json';

const rows = (cofid as unknown as { foods: CofidRow[] }).foods;
const foods = buildFoods(rows, []);
const byId = new Map(foods.map((f) => [f.id, f]));
const best = (name: string, state?: 'raw' | 'dry' | 'cooked') => searchFoods(foods, name, { state })[0]?.food.name;

describe('parseLine', () => {
  it('reads weights stuck to the number', () => {
    expect(parseLine('120g chicken')).toMatchObject({ qty: 120, unit: 'g', name: 'chicken' });
    expect(parseLine('7.5ml olive oil')).toMatchObject({ qty: 7.5, unit: 'ml', name: 'olive oil' });
    expect(parseLine('200 g chicken breast')).toMatchObject({ qty: 200, unit: 'g', name: 'chicken breast' });
  });
  it('reads counts and count words in either place', () => {
    expect(parseLine('4 cloves garlic')).toMatchObject({ qty: 4, unit: 'clove', name: 'garlic' });
    expect(parseLine('2 garlic cloves')).toMatchObject({ qty: 2, unit: 'clove', name: 'garlic' });
    expect(parseLine('1 fillet salmon')).toMatchObject({ qty: 1, unit: 'fillet', name: 'salmon' });
    expect(parseLine('slice gf toast')).toMatchObject({ qty: 1, unit: 'slice', name: 'gf toast' });
    expect(parseLine('1 zucchini')).toMatchObject({ qty: 1, name: 'zucchini' });
  });
  it('reads fractions, spoons and sizes', () => {
    expect(parseLine('1/2 onion')).toMatchObject({ qty: 0.5, name: 'onion' });
    expect(parseLine('½ tsp salt')).toMatchObject({ qty: 0.5, unit: 'tsp', name: 'salt' });
    expect(parseLine('1 1/2 cups rice')).toMatchObject({ qty: 1.5, unit: 'cup', name: 'rice' });
    expect(parseLine('2 tbsp olive oil')).toMatchObject({ qty: 2, unit: 'tbsp', name: 'olive oil' });
    expect(parseLine('1 large onion, finely chopped')).toMatchObject({ qty: 1, unit: 'large', name: 'onion', note: 'finely chopped' });
    expect(parseLine('2-3 carrots')).toMatchObject({ qty: 2.5, name: 'carrots' });
  });
  it('keeps raw / dry / cooked', () => {
    expect(parseLine('30g (dry) lentils')).toMatchObject({ qty: 30, unit: 'g', name: 'lentils', state: 'dry' });
    expect(parseLine('50g (dry) Pasta')).toMatchObject({ state: 'dry', name: 'Pasta' });
    expect(parseLine('200g cooked rice').state).toBe('cooked');
  });
  it('reads a count with its weight', () => {
    expect(parseLine('1.5/225g zucchini')).toMatchObject({ qty: 1.5, grams: 225, name: 'zucchini' });
    expect(parseLine('1 tin (400g) chopped tomatoes')).toMatchObject({ qty: 1, unit: 'tin', grams: 400, name: 'chopped tomatoes' });
  });
  it('handles "of" and & ', () => {
    expect(parseLine('5g of pecan&walnut')).toMatchObject({ qty: 5, unit: 'g', name: 'pecan&walnut' });
  });
});

describe('splitItems', () => {
  it("splits Nuria's comma lists, including a missing comma", () => {
    expect(splitItems('120g chicken, 100g broccoli/tenderstem, 1 zucchini, 1/2 onion, 2 garlic cloves7.5ml olive oil, 30ml kallo cube, 120g pear')).toEqual([
      '120g chicken', '100g broccoli/tenderstem', '1 zucchini', '1/2 onion', '2 garlic cloves', '7.5ml olive oil', '30ml kallo cube', '120g pear',
    ]);
  });
  it('splits lines but keeps bracketed commas', () => {
    expect(splitItems('Yogurt\n120g apple\n')).toEqual(['Yogurt', '120g apple']);
    expect(splitItems('1 tin (400g, drained) beans, 2 eggs')).toEqual(['1 tin (400g, drained) beans', '2 eggs']);
  });
  it('treats recipe text as one per line unless it is one long list', () => {
    expect(splitRecipeIngredients('1 large onion, chopped\n2 tbsp oil')).toEqual(['1 large onion, chopped', '2 tbsp oil']);
    expect(splitRecipeIngredients('100g potatoes, 120g green beans, 170g chicken')).toHaveLength(3);
  });
});

describe('formatQty', () => {
  it('formats amounts', () => {
    expect(formatQty(120, 'g')).toBe('120 g');
    expect(formatQty(4, 'clove')).toBe('4 cloves');
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(2, 'tbsp')).toBe('2 tbsp');
  });
});

describe('matching foods (CoFID)', () => {
  it('prefers the raw, plain version', () => {
    expect(best('chicken')).toBe('Chicken, light meat, raw');
    expect(best('salmon')).toBe('Salmon, farmed, flesh only, raw');
    expect(best('green beans')).toBe('Beans, green, raw');
    expect(best('potatoes')).toBe('Potatoes, old, raw, flesh only');
    expect(best('trozos de carne')).toBeUndefined();
    expect(best('olive oil')).toBe('Oil, olive');
    expect(best('onion')).toBe('Onions, raw');
    expect(best('garlic')).toBe('Garlic, raw');
    expect(best('blueberries')).toBe('Blueberries');
    expect(best('zucchini')).toMatch(/^Courgette, raw/);
    expect(best('broccoli/tenderstem')).toMatch(/^Broccoli, green, raw/);
    expect(best('cured ham')).toBe('Ham');
  });
  it('honours dry vs cooked', () => {
    expect(best('lentils', 'dry')).toMatch(/^Lentils.*dried, raw/);
    expect(best('boiled egg')).toMatch(/^Eggs, chicken, whole, boiled/);
    expect(best('white rice', 'cooked')).toMatch(/^Rice, white.*boiled/);
  });
  it('finds foods by every word', () => {
    expect(findFoods(foods, 'lentils red').map((f) => f.name)).toContain('Lentils, red, split, dried, raw');
  });
});

describe('grams', () => {
  const garlic = foods.find((f) => f.name === 'Garlic, raw')!;
  const oil = foods.find((f) => f.name === 'Oil, olive')!;
  it('uses portion weights for counts', () => {
    expect(toGrams({ qty: 4, unit: 'clove' }, garlic)).toEqual({ grams: 16, estimated: true });
    expect(toGrams({ qty: 0.5 }, foods.find((f) => f.name === 'Onions, raw'))).toEqual({ grams: 75, estimated: true });
  });
  it('converts spoons and ml with density', () => {
    expect(toGrams({ qty: 10, unit: 'ml' }, oil)!.grams).toBeCloseTo(9.2);
    expect(toGrams({ qty: 1, unit: 'tbsp' }, oil)!.grams).toBeCloseTo(13.8);
  });
  it('knows weights without a food, and gives up on unknown counts', () => {
    expect(toGrams({ qty: 2, unit: 'kg' })).toEqual({ grams: 2000, estimated: false });
    expect(toGrams({ qty: 1 }, null)).toBeNull();
  });
});

describe('recipe totals', () => {
  const oil = foods.find((f) => f.name === 'Oil, olive')!;
  const lentils = foods.find((f) => f.name === 'Lentils, red, split, dried, raw')!;
  const ingredients = [
    { id: 'a', text: '100g lentils', foodId: lentils.id, grams: 100 },
    { id: 'b', text: '10g oil', foodId: oil.id, grams: 10 },
    { id: 'c', text: 'salt', foodId: null },
    { id: 'd', text: 'mystery', foodId: undefined },
  ];
  const t = recipeTotals(ingredients, (id) => byId.get(id));
  it('adds up per 100 g values', () => {
    expect(t.sum.kcal).toBeCloseTo(lentils.per100.kcal! + oil.per100.kcal! / 10, 5);
    expect(t.grams).toBe(110);
    expect(t.missing.map((i) => i.id)).toEqual(['d']);
  });
  it('splits by servings or by cooked weight', () => {
    expect(perServing({ servings: 2 }, t).kcal).toBeCloseTo(t.sum.kcal! / 2);
    expect(perCookedGrams({ cookedWeight: 300 }, t, 150)!.kcal).toBeCloseTo(t.sum.kcal! / 2);
    expect(perCookedGrams({}, t, 150)).toBeNull();
    expect(kcalPer100Cooked({ cookedWeight: 300 }, t)).toBeCloseTo(t.sum.kcal! / 3);
  });
});

describe('our edits to foods', () => {
  it('overrides CoFID values, keeps the original, and resets when deleted', () => {
    const code = rows.find((r) => r[1] === 'Blueberries')![0];
    const edit: FoodEntry = { id: cofidId(code), kind: 'food', per100: { kcal: 57 }, editedBy: 'nuria', updatedAt: 1 };
    const edited = buildFoods(rows, [edit]).find((f) => f.id === cofidId(code))!;
    expect(edited.per100.kcal).toBe(57);
    expect(edited.source).toBe('edited');
    expect(edited.original?.kcal).toBe(40);
    expect(buildFoods(rows, [{ ...edit, deleted: true }]).find((f) => f.id === cofidId(code))!.source).toBe('cofid');
  });
  it('adds our own foods', () => {
    const mine: FoodEntry = { id: 'f1', kind: 'food', name: 'Gelatina con cosas', per100: { kcal: 52 }, updatedAt: 1 };
    const f = buildFoods(rows, [mine]).find((x) => x.id === 'f1')!;
    expect(f).toMatchObject({ name: 'Gelatina con cosas', source: 'custom', group: 'Our foods' });
    expect(f.per100.protein).toBeNull();
  });
});

describe('resolveLine', () => {
  it('goes from text to a weighed food', () => {
    const r = resolveLine('2 garlic cloves', foods);
    expect(byId.get(r.ingredient.foodId!)!.name).toBe('Garlic, raw');
    expect(r.ingredient.grams).toBe(8);
    expect(r.estimated).toBe(true);
    const l = resolveLine('30g (dry) lentils', foods);
    expect(l.checkState).toBe(true);
    expect(l.ingredient.grams).toBe(30);
  });
});

describe('Tom / Nuria / Both', () => {
  it('shows shared things in everyone’s view', () => {
    expect(visibleIn('tom', 'tom')).toBe(true);
    expect(visibleIn('nuria', 'tom')).toBe(false);
    expect(visibleIn('both', 'nuria')).toBe(true);
    expect(visibleIn('nuria', 'both')).toBe(true);
  });
});

describe('alternatives and unit-less items', () => {
  it('takes the first of "a/b" or "a or b"', () => {
    expect(byId.get(resolveLine('120g Carrots/Onions', foods).ingredient.foodId!)!.name).toMatch(/^Carrots/);
    expect(byId.get(resolveLine('120g Prawns or White fish', foods).ingredient.foodId!)!.name).toMatch(/^Prawns/);
  });
  it('counts "boiled egg" as one egg', () => {
    const r = resolveLine('boiled egg', foods);
    expect(r.ingredient.grams).toBe(50);
  });
  it('leaves foods CoFID lacks unmatched', () => {
    expect(resolveLine('slice gf toast', foods).ingredient.foodId).toBeUndefined();
    expect(resolveLine('30ml oatmilk', foods).ingredient.foodId).toBeUndefined();
  });
});

describe('more ways people write ingredients', () => {
  it('reads amounts at the end and "x2"', () => {
    expect(parseLine('fish sauce 1 tbsp')).toMatchObject({ qty: 1, unit: 'tbsp', name: 'fish sauce' });
    expect(parseLine('bean sprouts 100g')).toMatchObject({ qty: 100, unit: 'g', name: 'bean sprouts' });
    expect(parseLine('garlic x2 crushed')).toMatchObject({ qty: 2, name: 'garlic crushed' });
    expect(parseLine('2 garlic cloves crushed')).toMatchObject({ qty: 2, unit: 'clove' });
  });
  it('treats headings, seasoning and water as not counted', () => {
    expect(resolveLine('FOR THE CRISPY BREADCRUMBS:', foods).ingredient).toMatchObject({ heading: true, foodId: null, text: 'FOR THE CRISPY BREADCRUMBS' });
    expect(resolveLine('salt and pepper', foods).ingredient.foodId).toBeNull();
    expect(resolveLine('2.5 cup warm water', foods).ingredient.foodId).toBeNull();
    expect(byId.get(resolveLine('1 tsp salt', foods).ingredient.foodId!)!.name).toBe('Salt');
  });
  it('matches prep-worded lines', () => {
    expect(byId.get(resolveLine('2 garlic cloves crushed', foods).ingredient.foodId!)!.name).toBe('Garlic, raw');
    expect(resolveLine('2 garlic cloves crushed', foods).ingredient.grams).toBe(8);
    expect(byId.get(resolveLine('2 tsp smoked paprika', foods).ingredient.foodId!)!.name).toBe('Paprika');
    expect(byId.get(resolveLine('300g tagliatelle', foods).ingredient.foodId!)!.name).toMatch(/^Pasta, white, dried, raw/);
  });
});

describe('matches that would give badly wrong numbers', () => {
  const m = (t: string) => byId.get(resolveLine(t, foods).ingredient.foodId!)?.name;
  it('gets these right', () => {
    expect(m('1l hot vegetable stock')).toBe('Stock cubes, chicken, made up with water');
    expect(m('1 lemon, zest only')).toMatch(/^Lemons/);
    expect(m('2 tsp ground coriander')).toBe('Coriander seeds');
    expect(m('bacon')).toMatch(/^Bacon rashers, back.*raw/);
    expect(m('oil to pan fry')).toBe('Oil, vegetable, average');
    expect(m('1 tsp oregano')).toMatch(/^Oregano, dried/);
    expect(m('2 cans chickpeas, drained')).toMatch(/^Beans, chick peas, canned/);
    expect(m('2 x 400g cans black beans drained and rinsed')).toBeUndefined();
  });
});

describe('vague amounts and recipe-site wording', () => {
  const g = (l: string) => resolveLine(l, foods);
  const name = (l: string) => {
    const id = g(l).ingredient.foodId;
    return foods.find((f) => f.id === id)?.name;
  };
  it('reads describing words before a comma as part of the food', () => {
    expect(parseLine('3 fat, fresh red chillies, deseeded and thinly shredded')).toMatchObject({ qty: 3, name: 'fat fresh red chillies', note: 'deseeded and thinly shredded' });
    expect(name('3 fat, fresh red chillies, deseeded')).toMatch(/chilli, red/);
    expect(g('3 fat, fresh red chillies, deseeded').ingredient.grams).toBe(45);
  });
  it('gives knobs, thumbs, bunches and juice a typical weight', () => {
    expect(name('large knob of ginger')).toBe('Ginger, fresh');
    expect(g('knob of butter').ingredient.grams).toBe(10);
    expect(g('thumb-sized piece of ginger').ingredient.grams).toBe(15);
    expect(g('5cm ginger, peeled').ingredient.grams).toBe(25);
    expect(g('juice of 2 limes').ingredient.grams).toBe(60);
    expect(name('zest of 1 lemon')).toBe('Lemon peel');
    expect(g('small bunch of coriander').ingredient.grams).toBeLessThan(25);
  });
  it('matches herbs with "leaves" and spring onions with descriptions', () => {
    expect(name('small handful mint leaves')).toBe('Mint, fresh');
    expect(name('bunch spring onions, shredded lengthways')).toMatch(/^Spring onions/);
  });
  it('does not ask for a weight for oil for frying', () => {
    expect(g('sunflower oil, for frying').ingredient.foodId).toBeNull();
    expect(g('2 tbsp sunflower oil').ingredient.foodId).toBeTruthy();
  });
});

describe('ingredient lines from Paprika', () => {
  it('joins "for the tin:" onto the line before, but keeps "For the sauce:" as a heading', () => {
    expect(splitRecipeIngredients('butter\nfor the tin:\n800g soft cheese').map((l) => l.trim())).toEqual(['butter, for the tin', '800g soft cheese']);
    expect(splitRecipeIngredients('For the sauce:\n1 onion').map((l) => l.trim())).toEqual(['For the sauce:', '1 onion']);
  });
});
