/**
 * Nutrition maths. Everything goes through grams: an ingredient's grams × its food's values per
 * 100 g. A recipe's totals are the sum; a portion is a share of the servings, or a weight of the
 * finished dish when the cooked weight is known.
 */
import type { Food, Ingredient, Nutrients, NutrientKey, Recipe } from './types';
import { NUTRIENT_KEYS } from './types';
import { VOLUME_UNITS, type ParsedLine } from './parse';

const ML: Record<string, number> = { ml: 1, cl: 10, l: 1000, tsp: 5, dsp: 10, tbsp: 15, cup: 240 };
const WEIGHT: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
/** Small amounts with no better information. */
const LOOSE: Record<string, number> = { pinch: 0.5, handful: 30, sprig: 1, bunch: 25, knob: 10, thumb: 15, cm: 5, leaf: 0.5, zest: 2 };
/** Juice from one fruit, in grams. */
const JUICE: [RegExp, number][] = [[/^lime/i, 30], [/^lemon/i, 40], [/^orange/i, 90]];
const SIZE: Record<string, number> = { small: 0.7, medium: 1, large: 1.3 };

/** g per ml for things that aren't water-like. */
export function density(foodName: string): number {
  const n = foodName.toLowerCase();
  if (/^oil|, oil\b|\boil,/.test(n) || /^oil/.test(n)) return 0.92;
  if (/honey|syrup|treacle/.test(n)) return 1.4;
  if (/^flour/.test(n)) return 0.53;
  if (/^sugar/.test(n)) return 0.85;
  if (/^rice|^oats|porridge oats/.test(n)) return 0.8;
  if (/^milk|^cream|yogurt|^soup/.test(n)) return 1.03;
  return 1;
}

export interface GramsResult {
  grams: number;
  /** worked out from a typical weight or a volume, rather than weighed */
  estimated: boolean;
}

/** The weight of a parsed line, using the food's portion weights for counted things. */
export function toGrams(p: Pick<ParsedLine, 'qty' | 'unit' | 'grams' | 'size'>, food?: Food | null): GramsResult | null {
  if (p.grams != null) return { grams: p.grams, estimated: false };
  const sized = (g: number) => g * (p.size ? SIZE[p.size] * (p.size === 'large' ? 1.25 : 1) : 1);
  if (p.unit === 'juice') {
    const each = JUICE.find(([re]) => re.test(food?.name ?? ''))?.[1] ?? 40;
    return { grams: (p.qty ?? 1) * each, estimated: true };
  }
  const unit = p.unit;
  // "boiled egg", "Yogurt": one of whatever it is, if we know what one weighs
  const qty = p.qty ?? (!unit && food?.portions.some((x) => x.unit === 'each') ? 1 : undefined);
  if (qty == null) return null;
  if (unit && WEIGHT[unit]) return { grams: qty * WEIGHT[unit], estimated: false };
  if (unit && VOLUME_UNITS.has(unit)) return { grams: qty * ML[unit] * (food ? density(food.name) : 1), estimated: unit !== 'ml' && unit !== 'l' && unit !== 'cl' ? true : false };
  // a length of root (ginger, turmeric) weighs far more than a length of cinnamon stick
  if (unit === 'cm') return { grams: qty * (food && /ginger|galangal|turmeric|horseradish/i.test(food.name) ? 5 : 0.5), estimated: true };
  if (unit && LOOSE[unit]) return { grams: sized(qty * LOOSE[unit]), estimated: true };
  if (!food) return null;
  const portions = food.portions;
  const exact = unit && portions.find((x) => x.unit === unit);
  if (exact) return { grams: qty * exact.grams, estimated: true };
  const each = portions.find((x) => x.unit === 'each') ?? (portions.length === 1 ? portions[0] : undefined);
  if (each && (!unit || SIZE[unit] || ['piece', 'fillet', 'tin', 'slice', 'clove'].includes(unit))) {
    return { grams: qty * each.grams * (unit ? (SIZE[unit] ?? 1) : 1), estimated: true };
  }
  return null;
}

export const emptyNutrients = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugars: 0, salt: 0 });

/** grams of a food → its nutrients. Unknown values stay unknown. */
export function forGrams(food: Food, grams: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const v = food.per100[k];
    out[k] = v == null ? null : (v * grams) / 100;
  }
  return out;
}

export interface Totals {
  /** sums; a nutrient is null only if no ingredient had a value for it */
  sum: Nutrients;
  /** total raw weight of ingredients with a known weight */
  grams: number;
  /** ingredients that couldn't be counted (no food or no weight) */
  missing: Ingredient[];
  /** nutrients missing for some counted ingredient (e.g. CoFID "N") */
  gaps: NutrientKey[];
}

export function recipeTotals(ingredients: Ingredient[], getFood: (id: string) => Food | undefined): Totals {
  const sum = emptyNutrients();
  const seen = new Set<NutrientKey>();
  const gaps = new Set<NutrientKey>();
  const missing: Ingredient[] = [];
  let grams = 0;
  for (const ing of ingredients) {
    if (ing.foodId === null) continue; // deliberately not a food ("salt to taste", "water")
    const food = ing.foodId ? getFood(ing.foodId) : undefined;
    if (!food || ing.grams == null) {
      missing.push(ing);
      continue;
    }
    grams += ing.grams;
    const n = forGrams(food, ing.grams);
    for (const k of NUTRIENT_KEYS) {
      const v = n[k];
      if (v == null) gaps.add(k);
      else {
        sum[k] = (sum[k] ?? 0) + v;
        seen.add(k);
      }
    }
  }
  for (const k of NUTRIENT_KEYS) if (!seen.has(k)) sum[k] = null;
  return { sum, grams, missing, gaps: [...gaps] };
}

/** Scale nutrients by a factor. */
export function scale(n: Nutrients, f: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) out[k] = n[k] == null ? null : n[k]! * f;
  return out;
}

/** One serving of a recipe (total ÷ servings). */
export const perServing = (r: Pick<Recipe, 'servings'>, t: Totals) => scale(t.sum, 1 / Math.max(1, r.servings || 1));

/** A portion weighed from the finished dish. Needs the cooked weight. */
export function perCookedGrams(r: Pick<Recipe, 'cookedWeight'>, t: Totals, grams: number): Nutrients | null {
  if (!r.cookedWeight) return null;
  return scale(t.sum, grams / r.cookedWeight);
}

/** kcal per 100 g of the finished dish. */
export const kcalPer100Cooked = (r: Pick<Recipe, 'cookedWeight'>, t: Totals) =>
  r.cookedWeight && t.sum.kcal != null ? (t.sum.kcal * 100) / r.cookedWeight : null;

export const fmtKcal = (n: number | null | undefined) => (n == null ? '–' : `${Math.round(n)}`);
export const fmtG = (n: number | null | undefined) => (n == null ? '–' : n < 10 ? `${Math.round(n * 10) / 10}` : `${Math.round(n)}`);
