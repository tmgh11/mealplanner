/** From a line of text to an ingredient: read it, match a food, work out the grams. */
import type { Food, Ingredient } from './types';
import { isHeading, parseLine, type ParsedLine } from './parse';
import { searchFoods } from './foods';
import { toGrams } from './nutrition';

export const newIngredientId = () => Math.random().toString(36).slice(2, 10);

/** Foods whose weight changes a lot when cooked: worth checking raw vs cooked. */
const CHANGES_WHEN_COOKED = /^(pasta|spaghetti|noodles|rice|couscous|bulgur|quinoa|lentils|chickpeas|beans|split peas|barley|oats|chicken|turkey|beef|pork|lamb|salmon|cod|haddock|prawns|potatoes|sweet potato)/i;

export interface Resolved {
  ingredient: Ingredient;
  parsed: ParsedLine;
  /** the weight came from a typical portion or a spoon/cup measure */
  estimated: boolean;
  /** raw/dry vs cooked matters a lot for this food; worth a look */
  checkState: boolean;
  alternatives: Food[];
}

export function resolveLine(text: string, foods: Food[]): Resolved {
  const parsed = parseLine(text);
  if (isHeading(text)) {
    return { ingredient: { id: newIngredientId(), text: text.trim().replace(/:$/, ''), foodId: null, heading: true }, parsed, estimated: false, checkState: false, alternatives: [] };
  }
  // seasoning "to taste", water, spray: nothing to count or buy by weight
  if (/^(warm |cold |boiling |hot |iced )?water$|cooking spray|to taste|^(sea |table )?salt( and (black )?pepper)?$|^(black )?pepper$|^salt (&|and) pepper$/i.test(parsed.name) && (parsed.qty == null || /water/i.test(parsed.name))) {
    return { ingredient: { id: newIngredientId(), text: parsed.text, qty: parsed.qty, unit: parsed.unit, foodId: null }, parsed, estimated: false, checkState: false, alternatives: [] };
  }
  // "oil, for frying", "butter, for greasing": no amount given, so nothing to count
  if (parsed.qty == null && parsed.grams == null && /\bfor (shallow[- ]|deep[- ])?(frying|fry|drizzling|greasing|brushing|cooking|the (tin|pan|dish))\b/i.test(`${parsed.name} ${parsed.note ?? ''}`)) {
    return { ingredient: { id: newIngredientId(), text: parsed.text, foodId: null }, parsed, estimated: false, checkState: false, alternatives: [] };
  }
  // a tin of something is the cooked, canned kind
  const tinned = parsed.unit === 'tin' && !/\b(canned|tinned)\b/i.test(parsed.name);
  const state = tinned && !parsed.state ? 'cooked' : parsed.state;
  let matches = parsed.name ? searchFoods(foods, tinned ? `${parsed.name} canned` : parsed.name, { state, limit: 6 }) : [];
  if (!matches.length && tinned) matches = searchFoods(foods, parsed.name, { state, limit: 6 });
  // "Carrots/Onions", "Tofu or Paneer", "Orange/ 1 Kiwi": go with the first choice
  if (!matches.length && /\/|\bor\b/i.test(parsed.name)) {
    const first = parsed.name.split(/\/|\bor\b/i)[0].trim();
    if (first) matches = searchFoods(foods, first, { state, limit: 6 });
  }
  const food = matches[0]?.food ?? null;
  const g = toGrams(parsed, food);
  const ingredient: Ingredient = {
    id: newIngredientId(),
    text: parsed.text,
    qty: parsed.qty,
    unit: parsed.unit,
    foodId: food?.id,
    grams: g ? Math.round(g.grams * 10) / 10 : undefined,
  };
  return {
    ingredient,
    parsed,
    estimated: Boolean(g?.estimated),
    checkState: Boolean(food && CHANGES_WHEN_COOKED.test(food.name)),
    alternatives: matches.slice(1).map((m) => m.food),
  };
}

/** Re-work the grams when someone picks a different food (e.g. "1 clove" needs the food's clove weight). */
export function regram(ing: Ingredient, food: Food | null): Ingredient {
  const parsed = parseLine(ing.text);
  const g = toGrams({ qty: ing.qty ?? parsed.qty, unit: ing.unit ?? parsed.unit, grams: parsed.grams, size: parsed.size }, food);
  return { ...ing, foodId: food?.id ?? undefined, grams: g ? Math.round(g.grams * 10) / 10 : ing.grams };
}

export interface Flags {
  /** no food picked (and not marked "not a food") */
  noMatch: boolean;
  /** a food, but no weight */
  noWeight: boolean;
  /** weight from a typical portion or a spoon / cup measure */
  estimated: boolean;
  /** raw/dry vs cooked matters a lot for this food */
  checkState: boolean;
}

/** What to point out about an ingredient line in the editor. */
export function flags(ing: Ingredient, food: Food | undefined): Flags {
  const p = parseLine(ing.text);
  const unit = ing.unit ?? p.unit;
  const weighed = p.grams != null || (unit != null && ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'cl'].includes(unit));
  return {
    noMatch: ing.foodId === undefined,
    noWeight: Boolean(food) && ing.grams == null,
    estimated: Boolean(food) && ing.grams != null && !weighed && !ing.gramsSetByHand,
    checkState: Boolean(food && CHANGES_WHEN_COOKED.test(food.name)),
  };
}
