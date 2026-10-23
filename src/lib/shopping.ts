/**
 * The shopping list: lines from meals and recipes (scaled to who's eating), lines typed in,
 * grouped by supermarket aisle, with the same food from several meals shown as one line.
 */
import { addDays } from './dates';
import { parseLine } from './parse';
import { dayLabel, peopleOf } from './plan';
import type { Lookup } from './plan';
import type { Aisle, Food, Ingredient, Meal, Person, Recipe, ShopItem, ShopSource, Who } from './types';
import { AISLES, SLOT_LABELS, visibleIn } from './types';

// ---------- aisles ----------

export function aisleOf(food: Food | undefined, name = ''): Aisle {
  const n = `${food?.name ?? ''} ${name}`.toLowerCase();
  if (/\bfrozen\b/.test(n)) return 'Frozen';
  if (!food) {
    if (/\b(milk|yogh?urt|cheese|butter|cream|eggs?)\b/.test(n)) return 'Dairy & eggs';
    if (/\b(bread|toast|bread rolls?|wraps?|bagels?|pitta|crumpets?)\b/.test(n)) return 'Bakery';
    return 'Other';
  }
  const g = food.group;
  if (/\b(canned|tinned|in brine|in tomato sauce|dried|pickled)\b/.test(n) && g !== 'Dairy') return 'Cupboard';
  if (/juice|smoothie/.test(n)) return 'Drinks';
  switch (g) {
    case 'Vegetables':
    case 'Fruit':
      return 'Fruit & veg';
    case 'Meat and poultry':
    case 'Fish':
      return 'Meat & fish';
    case 'Dairy':
    case 'Eggs':
      return 'Dairy & eggs';
    case 'Cereals':
      return /^(bread|rolls?|bagels?|wraps?|tortilla|pitta|croissants?|crumpets?|muffins?|rusks?|chapati|naan)/i.test(food.name) ? 'Bakery' : 'Cupboard';
    case 'Herbs and spices':
      return /\bfresh\b/.test(n) ? 'Fruit & veg' : 'Cupboard';
    case 'Fats and oils':
      return /^(butter|spread|margarine|ghee)/i.test(food.name) ? 'Dairy & eggs' : 'Cupboard';
    case 'Drinks':
    case 'Alcohol':
      return 'Drinks';
    case 'Our foods':
      return aisleOf(undefined, food.name) === 'Other' ? 'Other' : aisleOf(undefined, food.name);
    default:
      return 'Cupboard';
  }
}

// ---------- lines from ingredients ----------

/** Units bought by count rather than weight. */
const COUNT_UNITS = new Set(['clove', 'slice', 'tin', 'fillet', 'rasher', 'cube', 'triangle', 'pot', 'piece', 'stick', 'head', 'bunch', 'sprig']);
const SPOON_UNITS = new Set(['tsp', 'tbsp', 'dsp', 'cup', 'pinch', 'handful']);
const ML: Record<string, number> = { ml: 1, cl: 10, l: 1000 };

const COOKING = /\b(raw|boiled|poached|steamed|grilled|roasted|roast|sauteed|sautéed|stir-fried|fried|baked|microwaved|stewed|casseroled|braised|scrambled|in (un)?salted water|weighed with [a-z ]+|re-heated|reheated)\b/gi;

/** A food as bought: the same whatever way it's cooked ("Eggs, boiled" and "Eggs, poached" are both eggs). */
export const shopKey = (food: Food) => food.name.toLowerCase().replace(COOKING, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** How a recipe says to prepare something: matters for cooking, not for shopping. */
const PREP = /\b(finely|thinly|roughly|coarsely|very|freshly|lightly|sliced|chopped|diced|minced|crushed|grated|peeled|deseeded|seeded|de-seeded|halved|quartered|shredded|torn|julienned|trimmed|rinsed|drained|beaten|softened|melted|cubed|zested|juiced|cut|pitted|stoned|cored|bashed|bruised|squeezed|toasted|lengthways|widthways|into|to serve|to garnish|for|plus|optional|at room temperature|separated)\b/i;
/** Words that describe the one to pick, not what it is. */
const DESCRIBING = /^(fat|large|small|medium|big|plump|ripe|good|quality|good-quality|heaped|level|generous|whole|fresh|thick|thin|optional|freshly|finely|thinly|roughly|coarsely|lightly|very|chopped(?!\s+tomato)|sliced|diced|crushed(?!\s+(tomato|chill))|grated|cracked|peeled|shredded|torn)\s+/i;

/** "Chicken breast" from "200g chicken breast, diced"; "Garlic" from "4 garlic cloves thinly sliced"; "Egg" from "Poached egg over steamed asparagus". */
export function shopName(text: string, food?: Food): string {
  let name = parseLine(text).name.replace(/^side(s)?\s*(:|of)\s*/i, '').trim();
  name = name.split(/\s+(?:with|over|on|served)\s+/i)[0];
  name = name.replace(/^(to serve|for serving|to garnish|optional|garnish)\s*:?\s*/i, '');
  // "Finely chopped onion", "Freshly ground black pepper": describing words in front first
  for (let i = 0; i < 4; i++) name = name.replace(DESCRIBING, '');
  // drop the preparation: cut at the first prep word once there's a food word before it
  const prep = name.search(PREP);
  if (prep > 0) name = name.slice(0, prep);
  name = name.replace(/\s+(and|or|&)\s*$/i, '').replace(/[\s,;-]+$/, '');
  for (let i = 0; i < 4; i++) name = name.replace(DESCRIBING, '');
  for (let i = 0; i < 3; i++) name = name.replace(/^(boiled|poached|steamed|grilled|roasted|roast|sauteed|sautéed|fried|baked|fresh)\s+/i, '');
  // if the words don't mention the food at all ("Omelette" matched to mushrooms), name it after the food
  const foodWords = (food?.name.toLowerCase().replace(COOKING, ' ').match(/[a-z]{3,}/g) ?? [])
    .map((w) => w.replace(/(es|s)$/, ''))
    .filter((w) => !['average', 'flesh', 'only', 'whole', 'dried', 'meat', 'and', 'with', 'light', 'dark'].includes(w));
  if (food && foodWords.length && !foodWords.some((w) => name.toLowerCase().includes(w))) name = food.name.split(',')[0];
  name = name.trim() || food?.name.split(',')[0] || text;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

type Line = Pick<ShopItem, 'name' | 'foodId' | 'key' | 'grams' | 'qty' | 'unit' | 'aisle'>;

/** One ingredient × how many times it's needed → a shopping line. Null for things that aren't bought. */
export function lineFor(ing: Ingredient, factor: number, food?: Food): Line | null {
  if (ing.foodId === null) return null; // "salt to taste", water…
  const p = parseLine(ing.text);
  const unit = ing.unit ?? p.unit;
  const qty = ing.qty ?? p.qty;
  const base = { name: shopName(ing.text, food), foodId: ing.foodId ?? undefined, key: food ? shopKey(food) : undefined, aisle: aisleOf(food, p.name) };
  const round = (n: number) => Math.round(n * 100) / 100;
  if (ing.gramsSetByHand && ing.grams != null) return { ...base, grams: round(ing.grams * factor) };
  if (unit && ML[unit] && qty != null) return { ...base, qty: round(qty * ML[unit] * factor), unit: 'ml' };
  if (qty != null && unit && (COUNT_UNITS.has(unit) || SPOON_UNITS.has(unit))) return { ...base, qty: round(qty * factor), unit };
  const each = food?.portions.some((x) => x.unit === 'each');
  // "1/2 onion", and "boiled egg" / "Yogurt" with no number: bought as whole items
  if (!unit && p.grams == null && ((qty != null && (ing.grams == null || each)) || (qty == null && each))) {
    return { ...base, qty: round((qty ?? 1) * factor), unit: 'each' };
  }
  if (ing.grams != null) return { ...base, grams: round(ing.grams * factor) };
  return base; // no amount known: still worth buying
}

/** How many recipes' worth a meal needs: each person's servings ÷ the recipe's servings (or grams ÷ cooked weight). */
export function recipeFactor(recipe: Recipe, portions: Partial<Record<Person, { servings?: number; grams?: number }>>, who: Who): number {
  let f = 0;
  for (const p of peopleOf(who)) {
    const portion = portions[p] ?? { servings: 1 };
    if (portion.grams != null && recipe.cookedWeight) f += portion.grams / recipe.cookedWeight;
    else f += (portion.servings ?? 1) / Math.max(1, recipe.servings || 1);
  }
  return f;
}

export type Skip = 'leftovers' | 'note' | 'missing-recipe';

/** The shopping lines for one meal. Leftovers and notes have nothing to buy. */
export function linesForMeal(meal: Meal, l: Lookup): { lines: Line[]; skip?: Skip; source: ShopSource } {
  const c = meal.content;
  const recipe = c.type === 'recipe' ? l.recipe(c.recipeId) : undefined;
  const what = c.type === 'recipe' ? recipe?.title : meal.label;
  const source: ShopSource = {
    label: `${dayLabel(meal.date)} ${SLOT_LABELS[meal.slot].toLowerCase()}${what ? ` · ${what}` : ''}`,
    mealId: meal.id,
    recipeId: recipe?.id,
    date: meal.date,
    forWho: meal.who,
  };
  if (meal.leftovers) return { lines: [], skip: 'leftovers', source };
  if (c.type === 'note') return { lines: [], skip: 'note', source };
  if (c.type === 'items') {
    const n = peopleOf(meal.who).length;
    return { lines: c.ingredients.map((i) => lineFor(i, n, i.foodId ? l.food(i.foodId) : undefined)).filter((x): x is Line => Boolean(x)), source };
  }
  if (!recipe) return { lines: [], skip: 'missing-recipe', source };
  const f = recipeFactor(recipe, c.portions, meal.who);
  return { lines: recipe.ingredients.map((i) => lineFor(i, f, i.foodId ? l.food(i.foodId) : undefined)).filter((x): x is Line => Boolean(x)), source };
}

export const toItem = (line: Line, source: ShopSource | undefined, addedBy: Person, id: string, addedAt: number): ShopItem => ({
  ...line,
  id,
  kind: 'shop',
  checked: false,
  addedBy,
  source,
  addedAt,
  updatedAt: 0,
});

export interface CalendarPlan {
  add: ShopItem[];
  meals: number;
  /** meals with nothing to buy, or already on the list */
  leftovers: number;
  notes: number;
  already: number;
}

/** Everything to buy for the meals in a run of days, for Tom, Nuria or both. Meals already on the list are skipped. */
export function planFromCalendar(
  mealsByDate: Map<string, Meal[]>,
  from: string,
  days: number,
  view: Who,
  existing: ShopItem[],
  l: Lookup,
  me: Person,
  newId: () => string,
): CalendarPlan {
  const onList = new Set(existing.map((i) => i.source?.mealId).filter(Boolean));
  const plan: CalendarPlan = { add: [], meals: 0, leftovers: 0, notes: 0, already: 0 };
  let t = Date.now();
  for (let i = 0; i < days; i++) {
    for (const meal of mealsByDate.get(addDays(from, i)) ?? []) {
      if (!visibleIn(meal.who, view)) continue;
      if (onList.has(meal.id)) {
        plan.already++;
        continue;
      }
      const r = linesForMeal(meal, l);
      if (r.skip === 'leftovers') plan.leftovers++;
      else if (r.skip) plan.notes++;
      if (!r.lines.length) continue;
      plan.meals++;
      for (const line of r.lines) plan.add.push(toItem(line, r.source, me, newId(), t++));
    }
  }
  return plan;
}

// ---------- the list as shown ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Lines with the same key are one line on the list. */
export const groupKey = (i: Pick<ShopItem, 'foodId' | 'name'> & { key?: string }) => i.key ?? i.foodId ?? `name:${norm(i.name)}`;

export function fmtAmount(items: Pick<ShopItem, 'grams' | 'qty' | 'unit'>[]): string {
  const grams = items.reduce((s, i) => s + (i.grams ?? 0), 0);
  const byUnit = new Map<string, number>();
  for (const i of items) if (i.qty != null && i.unit) byUnit.set(i.unit, (byUnit.get(i.unit) ?? 0) + i.qty);
  const parts: string[] = [];
  if (grams > 0) parts.push(grams >= 1000 ? `${Math.round(grams / 100) / 10} kg` : `${Math.round(grams)} g`);
  for (const [unit, q] of byUnit) {
    const n = Math.round(q * 10) / 10;
    if (unit === 'ml') parts.push(n >= 1000 ? `${Math.round(n / 100) / 10} l` : `${Math.round(n)} ml`);
    else if (unit === 'each') parts.push(`${n}`);
    else parts.push(`${n} ${unit}${n === 1 || ['tsp', 'tbsp', 'dsp'].includes(unit) ? '' : unit === 'pinch' ? 'es' : 's'}`);
  }
  return parts.join(' + ');
}

export interface ShopGroup {
  key: string;
  name: string;
  aisle: Aisle;
  items: ShopItem[];
  amount: string;
  checked: boolean;
  /** who added lines in this group */
  addedBy: Person[];
}

function buildGroups(items: ShopItem[]): ShopGroup[] {
  const groups = new Map<string, ShopGroup>();
  for (const i of items) {
    const key = `${i.checked ? 'x' : 'o'}|${groupKey(i)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, name: i.name, aisle: i.aisle, items: [], amount: '', checked: i.checked, addedBy: [] };
      groups.set(key, g);
    }
    g.items.push(i);
    if (!g.addedBy.includes(i.addedBy)) g.addedBy.push(i.addedBy);
  }
  // a line without a food ("Egg") joins the matching food's line if the names agree
  const single = (x: string) => norm(x).replace(/(es|s)\b/g, '');
  for (const [key, g] of groups) {
    if (!key.includes('|name:')) continue;
    const twin = [...groups.entries()].find(([k, o]) => k !== key && !k.includes('|name:') && o.checked === g.checked && o.items.some((i) => single(i.name) === single(g.items[0].name)));
    if (twin) {
      twin[1].items.push(...g.items);
      for (const p of g.addedBy) if (!twin[1].addedBy.includes(p)) twin[1].addedBy.push(p);
      groups.delete(key);
    }
  }
  for (const g of groups.values()) {
    g.amount = fmtAmount(g.items);
    // the shortest name people used reads best ("Chicken" over "Chicken breast (skinless)")
    g.name = g.items.map((i) => i.name).sort((a, b) => a.length - b.length)[0];
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Still to buy: lines for the same food shown as one, by aisle in shop order. */
export function groupShopping(items: ShopItem[]): { aisle: Aisle; groups: ShopGroup[] }[] {
  const groups = buildGroups(items.filter((i) => !i.checked));
  return AISLES.map((aisle) => ({ aisle, groups: groups.filter((g) => g.aisle === aisle) })).filter((a) => a.groups.length);
}

/** In the basket: ticked lines, grouped the same way. */
export const checkedGroups = (items: ShopItem[]): ShopGroup[] => buildGroups(items.filter((i) => i.checked));

/**
 * An amount typed on the shopping list ("3", "200g", "1.5 kg", "2 tins", "500 ml") → the fields
 * a shopping line keeps. Empty means no amount. Null if it can't be read.
 */
export function parseAmount(text: string): Pick<ShopItem, 'grams' | 'qty' | 'unit'> | null {
  const t = text.trim();
  if (!t) return { grams: undefined, qty: undefined, unit: undefined };
  const p = parseLine(`${t} x`);
  if (p.qty == null || !(p.qty > 0) || (p.name && p.name !== 'x')) return null;
  const q = Math.round(p.qty * 100) / 100;
  const w: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  if (p.unit && w[p.unit]) return { grams: Math.round(q * w[p.unit] * 10) / 10, qty: undefined, unit: undefined };
  if (p.unit && ML[p.unit]) return { grams: undefined, qty: q * ML[p.unit], unit: 'ml' };
  return { grams: undefined, qty: q, unit: p.unit && !['large', 'medium', 'small'].includes(p.unit) ? p.unit : 'each' };
}

/** What someone typed, minus the amount at the front: "2 tins chopped tomatoes, drained" → "Chopped tomatoes, drained". */
export function typedName(t: string): string {
  const p = parseLine(t);
  let name = t.trim();
  if (p.qty != null && p.name) {
    const at = name.toLowerCase().indexOf(p.name.toLowerCase().split(/\s+/)[0]);
    if (at > 0) name = name.slice(at);
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}
