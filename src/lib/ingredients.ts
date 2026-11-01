/** From a line of text to an ingredient: read it, match a food, work out the grams. */
import type { Food, Ingredient } from './types';
import { headingText, isHeading, parseLine, type ParsedLine } from './parse';
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

/**
 * What to look a drink up as. "oatmilk" is oat milk; tea or coffee "with oat milk" (or any milk)
 * is CoFID's tea or coffee made with milk: a splash of oat drink has about the same calories as
 * one of semi-skimmed.
 */
export function drinkName(name: string): string {
  const n = name
    .replace(/\b(oat|soya|soy|almond|coconut|rice)milk\b/gi, '$1 milk')
    .replace(/^(?:an?\s+)?(?:mug|cup|splash|dash|drop)\s+of\s+/i, '');
  if (/^(cappuccino|latte|flat white|cafe latte|caffe latte)s?$/i.test(n.trim())) return 'coffee cappuccino latte';
  // Fage: the 0% unless it says full fat (5%)
  if (/\bfage\b/i.test(n)) return /\b5\s*%|full[- ]fat|whole/i.test(n) ? 'fage total full fat' : 'fage total 0';
  const m = n.match(/^(black |white )?(coffee|tea)\s+with\s+(?:a\s+(?:splash|dash|drop)\s+of\s+)?(oat|soya|soy|almond|semi[- ]skimmed|skimmed|whole|full[- ]fat)?\s*(?:milk|drink)$/i);
  if (m) return `${m[2]} infusion average with ${/whole|full/i.test(m[3] ?? '') ? 'whole' : 'semi-skimmed'} milk`;
  if (/^(black )?(coffee|tea)$/i.test(n.trim())) return `${n.trim().replace(/^black /i, '')} infusion average`;
  if (/^(oat|oats) (milk|drink)$/i.test(n.trim())) return 'oat drink';
  return n;
}

export function resolveLine(text: string, foods: Food[]): Resolved {
  const parsed = parseLine(text);
  if (isHeading(text)) {
    return { ingredient: { id: newIngredientId(), text: headingText(text), foodId: null, heading: true }, parsed, estimated: false, checkState: false, alternatives: [] };
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
  const name = drinkName(parsed.name);
  // "a splash of milk": one splash, whatever a splash of that weighs
  if (parsed.qty == null && parsed.grams == null && /^(?:an?\s+)?(?:splash|dash) of /i.test(parsed.name)) {
    parsed.qty = 1;
    parsed.unit = 'splash';
  }
  let matches = name ? searchFoods(foods, tinned ? `${name} canned` : name, { state, limit: 6 }) : [];
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

/**
 * Recipes saved before a line like "[spice paste]" counted as a heading have it as an
 * ingredient. Turns those into headings. Null if there's nothing to change.
 */
export function fixHeadings<T extends { ingredients: Ingredient[] }>(r: T): T | null {
  let changed = false;
  const ingredients = r.ingredients.map((i) => {
    if (i.heading || i.gramsSetByHand || !isHeading(i.text)) return i;
    changed = true;
    return { id: i.id, text: headingText(i.text), foodId: null, heading: true };
  });
  return changed ? { ...r, ingredients } : null;
}

const DRINK = /\b(coffee|tea|cappuccino|latte|flat white|oat ?milk|oat drink|milk)\b/i;

/**
 * Items left without a food or an amount get another go: a food added since ("Gluten free bread"),
 * or a typical weight it now has, can fill them in. A food someone already picked is kept (except
 * for drinks saved before the app knew about mugs and oat milk); anything weighed by hand, or
 * marked as not counted, is left alone. Null if there's nothing to change.
 */
export function fillUnmatched(ingredients: Ingredient[], foods: Food[]): Ingredient[] | null {
  let changed = false;
  const out = ingredients.map((i) => {
    if (i.heading || i.gramsSetByHand || i.foodId === null || (i.foodId && i.grams != null)) return i;
    if (i.foodId && !DRINK.test(i.text)) {
      const food = foods.find((f) => f.id === i.foodId);
      const g = food ? toGrams(parseLine(i.text), food) : null;
      if (!g) return i;
      changed = true;
      return { ...i, grams: Math.round(g.grams * 10) / 10 };
    }
    const r = resolveLine(i.text, foods).ingredient;
    if (!r.foodId || (r.foodId === i.foodId && r.grams == null)) return i;
    changed = true;
    return { ...i, foodId: r.foodId, grams: r.grams, qty: r.qty, unit: r.unit };
  });
  return changed ? out : null;
}
