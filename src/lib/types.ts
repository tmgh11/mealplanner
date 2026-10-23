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
  /** a heading inside the list, e.g. "FOR THE SAUCE:" (not a food) */
  heading?: boolean;
}

export interface Recipe extends Base {
  kind: 'recipe';
  title: string;
  owner: Who;
  servings: number;
  /** times in minutes; total is worked out from prep + cook when not given */
  prepMins?: number;
  cookMins?: number;
  totalMins?: number;
  /** weight of the finished dish, if weighed; portions can then be served by weight */
  cookedWeight?: number;
  ingredients: Ingredient[];
  method: string;
  notes?: string;
  sourceUrl?: string;
  tags: string[];
  rating?: number;
  /** a small photo: a data: URL (imported) or a web address */
  photo?: string;
  /** where it was imported from, so it isn't imported twice, e.g. "paprika:<uid>" */
  importId?: string;
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

export type Slot = 'breakfast' | 'lunch' | 'snacks' | 'dinner';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'snacks', 'dinner'];
export const SLOT_LABELS: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };

/** How much of a recipe one person has: servings, or grams of the finished dish. */
export interface Portion1 {
  servings?: number;
  grams?: number;
}

/** What a meal is. */
export type MealContent =
  /** a saved recipe, with each person's portion */
  | { type: 'recipe'; recipeId: string; portions: Partial<Record<Person, Portion1>> }
  /** a list of weighed items, Nuria-style; amounts are per person */
  | { type: 'items'; ingredients: Ingredient[] }
  /** just words: "Pizza night", "Out in town" */
  | { type: 'note'; text: string };

/** The parts of a meal that a menu stores too. */
export interface MealBody {
  slot: Slot;
  who: Who;
  content: MealContent;
  /** e.g. "Legume Day", "Carb Swap" */
  label?: string;
  /** eaten from something cooked earlier: not added to the shopping list */
  leftovers?: boolean;
}

export interface Meal extends Base, MealBody {
  kind: 'meal';
  /** YYYY-MM-DD */
  date: string;
  /** order within the slot */
  order: number;
  /** the menu it came from, if any */
  menuId?: string;
  createdBy?: Person;
}

export interface MenuDay {
  meals: MealBody[];
}

export interface Menu extends Base {
  kind: 'menu';
  name: string;
  owner: Who;
  /** Day 1, Day 2… (not weekdays), so a menu can start on any day */
  days: MenuDay[];
  notes?: string;
  createdBy?: Person;
}

/** Supermarket aisles, in roughly the order you'd walk a big UK supermarket. */
export const AISLES = [
  'Fruit & veg',
  'Bakery',
  'Meat & fish',
  'Deli & chilled',
  'Dairy, eggs & cheese',
  'Pasta, rice & tins',
  'Herbs, spices & sauces',
  'Baking',
  'Breakfast & hot drinks',
  'Snacks & sweets',
  'Drinks',
  'Frozen',
  'Household & toiletries',
  'Pet',
  'Other',
] as const;
export type Aisle = (typeof AISLES)[number];
export const isAisle = (a: string): a is Aisle => (AISLES as readonly string[]).includes(a);

/** Where a shopping item came from. */
export interface ShopSource {
  /** e.g. "Thu 15 Oct lunch", "Lentil stew", or empty for something typed in */
  label: string;
  mealId?: string;
  recipeId?: string;
  date?: string;
  /** who the meal or recipe was for */
  forWho?: Who;
}

/** One line someone put on the shopping list. Lines for the same food are shown together. */
export interface ShopItem extends Base {
  kind: 'shop';
  /** what to show, e.g. "Chicken breast" */
  name: string;
  foodId?: string;
  /** lines with the same key show as one (the food as bought, whatever way it's cooked) */
  key?: string;
  /** amount: grams for weighed things; qty + unit for counted ones ("4 cloves", "2 tins") */
  grams?: number;
  qty?: number;
  unit?: string;
  aisle: Aisle;
  checked: boolean;
  addedBy: Person;
  source?: ShopSource;
  /** for keeping lines in the order they were added */
  addedAt: number;
}

export type Entry = FoodEntry | Recipe | Settings | Meal | Menu | ShopItem;

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
