export type Person = 'tom' | 'nuria';
export const PEOPLE: Person[] = ['tom', 'nuria'];

/** Who something is for or belongs to. */
export type Who = Person | 'both';

/** Per 100 g. null = not known (CoFID marks some values as "present but not measured"). */
export interface Nutrients {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  sugars: number | null;
  salt: number | null;
}
export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugars', 'salt'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** A named amount of a food, e.g. "1 clove" = 3 g. */
export interface Portion {
  /** singular unit word: clove, slice, tin, fillet, egg, medium… ('each' for a whole item) */
  unit: string;
  grams: number;
}

/** A food as the app uses it: from CoFID, a CoFID food someone edited, or one of our own. */
export interface Food {
  /** 'cofid:13-657' or a custom id */
  id: string;
  name: string;
  group: string;
  per100: Nutrients;
  portions: Portion[];
  /** set when the values come from CoFID untouched */
  source: 'cofid' | 'edited' | 'custom';
  editedBy?: Person;
  /** the CoFID values, kept when someone has overridden them */
  original?: Nutrients;
}

interface Base {
  id: string;
  /** client timestamp (ms) of last edit – used for last-write-wins merging */
  updatedAt: number;
  deleted?: boolean;
}

/**
 * Our change to a food. For a CoFID food the id is 'cofid:<code>' and only the fields set here
 * replace CoFID's; deleting the entry resets the food. For our own foods everything lives here.
 */
export interface FoodEntry extends Base {
  kind: 'food';
  name?: string;
  per100?: Partial<Nutrients>;
  portions?: Portion[];
  editedBy?: Person;
}

export interface Ingredient {
  id: string;
  /** the line as typed or imported, e.g. "120g chicken breast, diced" */
  text: string;
  qty?: number;
  unit?: string;
  /** the food it was matched to (null = not a food, e.g. "salt to taste") */
  foodId?: string | null;
  /** the weight used for nutrition; set when known */
  grams?: number;
  /** someone typed the grams in, rather than the app working them out */
  gramsSetByHand?: boolean;
}

export interface Recipe extends Base {
  kind: 'recipe';
  title: string;
  owner: Who;
  servings: number;
  /** weight of the finished dish, if weighed; portions can then be served by weight */
  cookedWeight?: number;
  ingredients: Ingredient[];
  method: string;
  notes?: string;
  sourceUrl?: string;
  tags: string[];
  rating?: number;
  createdBy?: Person;
}

export interface Tracking {
  on: boolean;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface Settings extends Base {
  kind: 'settings';
  names: Record<Person, string>;
  /** nutrition is opt-in per person */
  tracking: Record<Person, Tracking>;
}

export type Entry = FoodEntry | Recipe | Settings;

export const SETTINGS_ID = 'settings';

export function defaultSettings(): Settings {
  return {
    id: SETTINGS_ID,
    kind: 'settings',
    names: { tom: 'Tom', nuria: 'Nuria' },
    tracking: { tom: { on: false }, nuria: { on: false } },
    updatedAt: 0,
  };
}

/** Does something owned by `owner` show in the `view` (Tom / Nuria / Both)? Shared things show in both. */
export const visibleIn = (owner: Who, view: Who) => view === 'both' || owner === 'both' || owner === view;
