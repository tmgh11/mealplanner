/**
 * The food list: CoFID (UK government data, bundled with the app) with our own edits laid over
 * it, plus foods we add ourselves. Also: typical portion weights, and matching ingredient text to
 * a food.
 */
import type { Food, FoodEntry, Nutrients, Portion } from './types';
import { NUTRIENT_KEYS } from './types';

/** One CoFID row as bundled: [code, name, group, kcal, protein, carbs, fat, fibre, sugars, salt] */
export type CofidRow = [string, string, string, ...(number | null)[]];

export const cofidId = (code: string) => `cofid:${code}`;

export function rowToNutrients(r: CofidRow): Nutrients {
  const [, , , kcal, protein, carbs, fat, fibre, sugars, salt] = r;
  return { kcal, protein, carbs, fat, fibre, sugars, salt } as Nutrients;
}

const EMPTY: Nutrients = { kcal: null, protein: null, carbs: null, fat: null, fibre: null, sugars: null, salt: null };

/**
 * Typical weights for counted things ("1 clove", "1 slice", "1 onion"). These are estimates of a
 * medium item's edible weight; anyone can change them per food. Matched on the food's name.
 */
const DEFAULT_PORTIONS: [RegExp, Portion[]][] = [
  [/^garlic, raw/i, [{ unit: 'clove', grams: 4 }]],
  [/^eggs, chicken, whole/i, [{ unit: 'each', grams: 50 }]],
  [/^eggs, chicken, white/i, [{ unit: 'each', grams: 33 }]],
  [/^bread|^toast/i, [{ unit: 'slice', grams: 36 }]],
  [/^onions, raw/i, [{ unit: 'each', grams: 150 }]],
  [/^onions, spring/i, [{ unit: 'each', grams: 15 }]],
  [/^courgette, raw/i, [{ unit: 'each', grams: 200 }]],
  [/^pears?, .*raw/i, [{ unit: 'each', grams: 160 }]],
  [/^apples, eating, raw/i, [{ unit: 'each', grams: 150 }]],
  [/^kiwi ?fruit/i, [{ unit: 'each', grams: 70 }]],
  [/^oranges, raw/i, [{ unit: 'each', grams: 160 }]],
  [/^bananas/i, [{ unit: 'each', grams: 100 }]],
  [/^tomatoes, (standard|average)?.*raw/i, [{ unit: 'each', grams: 85 }]],
  [/^tomatoes, cherry, raw/i, [{ unit: 'each', grams: 15 }]],
  [/^carrots, (old|young)?.*raw/i, [{ unit: 'each', grams: 80 }]],
  [/^potatoes, .*raw/i, [{ unit: 'each', grams: 175 }]],
  [/^peppers, capsicum, chilli/i, [{ unit: 'each', grams: 15 }]],
  [/^peppers?, .*raw/i, [{ unit: 'each', grams: 160 }]],
  [/^lemons/i, [{ unit: 'each', grams: 60 }]],
  [/^salmon, .*raw/i, [{ unit: 'fillet', grams: 120 }]],
  [/^(cod|haddock|pollock|hake|plaice|sea bass|bass, sea), .*raw/i, [{ unit: 'fillet', grams: 140 }]],
  [/^tuna, canned in (brine|water|spring water|sunflower oil)/i, [{ unit: 'tin', grams: 112 }]],
  [/^bacon rashers/i, [{ unit: 'rasher', grams: 25 }]],
  [/^stock cubes/i, [{ unit: 'cube', grams: 10 }]],
  [/^chicken, light meat, raw/i, [{ unit: 'each', grams: 150 }, { unit: 'slice', grams: 20 }]],
  [/^turkey, light meat/i, [{ unit: 'slice', grams: 20 }]],
  [/^yogurt/i, [{ unit: 'pot', grams: 125 }, { unit: 'each', grams: 125 }]],
  [/^cheese, spreadable/i, [{ unit: 'triangle', grams: 17.5 }]],
  [/^rusks/i, [{ unit: 'each', grams: 17 }]],
];

export function defaultPortions(name: string): Portion[] {
  for (const [re, p] of DEFAULT_PORTIONS) if (re.test(name)) return p;
  return [];
}

/** Lay our edits over the CoFID foods and add our own. Deleted edits fall back to CoFID. */
export function buildFoods(rows: CofidRow[], entries: FoodEntry[]): Food[] {
  const edits = new Map(entries.filter((e) => !e.deleted).map((e) => [e.id, e]));
  const foods: Food[] = rows.map((r) => {
    const id = cofidId(r[0]);
    const base: Food = { id, name: r[1], group: r[2], per100: rowToNutrients(r), portions: defaultPortions(r[1]), source: 'cofid' };
    const e = edits.get(id);
    if (!e) return base;
    edits.delete(id);
    return applyEdit(base, e);
  });
  for (const e of edits.values()) {
    if (e.id.startsWith('cofid:')) continue; // an edit for a food CoFID no longer lists
    foods.push({
      id: e.id,
      name: e.name ?? 'Unnamed food',
      group: 'Our foods',
      per100: { ...EMPTY, ...e.per100 },
      portions: e.portions ?? [],
      source: 'custom',
      editedBy: e.editedBy,
    });
  }
  return foods;
}

function applyEdit(base: Food, e: FoodEntry): Food {
  const changedValues = e.per100 && NUTRIENT_KEYS.some((k) => e.per100![k] !== undefined && e.per100![k] !== base.per100[k]);
  return {
    ...base,
    name: e.name ?? base.name,
    per100: { ...base.per100, ...e.per100 },
    portions: e.portions ?? base.portions,
    source: changedValues || e.name ? 'edited' : base.source,
    editedBy: e.editedBy,
    original: changedValues ? base.per100 : undefined,
  };
}

// ---------- matching ingredient text to a food ----------

/** Words people use → the word CoFID uses. */
const SYNONYMS: Record<string, string> = {
  'smoked paprika': 'paprika', 'sweet paprika': 'paprika', 'ground cumin': 'cumin seeds', cumin: 'cumin seeds',
  'dijon mustard': 'mustard powder made up', 'wholegrain mustard': 'mustard powder made up', 'english mustard': 'mustard powder made up', mustard: 'mustard powder made up',
  'cinnamon stick': 'cinnamon ground', cinnamon: 'cinnamon ground', 'caster sugar': 'sugar white', 'golden caster sugar': 'sugar white', 'golden sugar': 'sugar white',
  'granulated sugar': 'sugar white', 'light brown soft sugar': 'sugar brown', 'soft brown sugar': 'sugar brown', 'brown sugar': 'sugar brown', 'icing sugar': 'sugar icing', sugar: 'sugar white',
  'balsamic vinegar': 'vinegar', 'rice wine vinegar': 'vinegar', 'cider vinegar': 'vinegar', 'white wine vinegar': 'vinegar', 'red wine vinegar': 'vinegar',
  pineapple: 'pineapple flesh only', 'puff pastry': 'pastry puff', 'black pepper': 'pepper black', 'soy sauce': 'soy sauce', 'coconut milk': 'coconut milk',
  'tomato paste': 'tomato puree', 'tomato puree': 'tomato puree', worcestershire: 'worcestershire sauce', lime: 'limes flesh only', limes: 'limes flesh only',
  'spring onions': 'spring onions bulbs and tops', 'spring onion': 'spring onions bulbs and tops', 'chicken thighs and drumsticks': 'chicken dark meat',
  sausages: 'sausages pork', sausage: 'sausages pork', 'pork sausages': 'sausages pork', tagliatelle: 'pasta white dried', linguine: 'pasta white dried', linguini: 'pasta white dried',
  penne: 'pasta white dried', fusilli: 'pasta white dried', rigatoni: 'pasta white dried', 'arborio rice': 'rice white arborio', 'risotto rice': 'rice white arborio',
  peanuts: 'peanuts kernel only plain', 'peanut butter': 'peanut butter smooth', 'chilli flakes': 'chilli powder', 'chilli powder': 'chilli powder', ginger: 'ginger fresh',
  parsley: 'parsley fresh', basil: 'basil fresh', coriander: 'coriander leaves fresh', thyme: 'thyme fresh', 'lemon thyme': 'thyme fresh', oregano: 'oregano dried',
  lemon: 'lemons whole', lemons: 'lemons whole', bacon: 'bacon rashers back raw', 'smoked bacon': 'bacon rashers back raw', 'bacon lardons': 'bacon rashers back raw',
  'vegetable stock': 'stock cubes chicken made up water', 'chicken stock': 'stock cubes chicken made up water', 'beef stock': 'stock cubes chicken made up water',
  'vegetable broth': 'stock cubes chicken made up water', 'chicken broth': 'stock cubes chicken made up water', stock: 'stock cubes chicken made up water',
  'stock cube': 'stock cubes chicken', 'kallo cube': 'stock cubes vegetable', 'ground coriander': 'coriander seeds', oil: 'oil vegetable average', 'vegetable oil': 'oil vegetable average',
  'plum tomatoes': 'tomatoes canned', 'sea salt': 'salt', 'salt flakes': 'salt', 'fish sauce': 'fish sauce',
  'red onions': 'onions', 'long-stem broccoli': 'broccoli green', 'garlic cloves': 'garlic', 'garlic clove': 'garlic',
  zucchini: 'courgette', zucchinis: 'courgette', eggplant: 'aubergine', arugula: 'rocket', tenderstem: 'broccoli',
  scallion: 'spring onions bulbs and tops', scallions: 'spring onions bulbs and tops', cilantro: 'coriander',
  garbanzo: 'beans chick peas', chickpea: 'beans chick peas', chickpeas: 'beans chick peas', mince: 'beef mince', 'mince meat': 'beef mince', 'minced beef': 'beef mince',
  'ground beef': 'beef mince', 'lean beef mince': 'beef mince extra lean', yoghurt: 'yogurt plain', prawn: 'prawns', shrimp: 'prawns',
  capsicum: 'peppers', 'bell pepper': 'peppers', 'cottage cheese': 'cheese cottage', 'cheddar': 'cheese cheddar',
  'parmesan': 'cheese parmesan', 'feta': 'cheese feta', halloumi: 'cheese halloumi', mozzarella: 'cheese mozzarella',
  'olive oil': 'oil olive', 'sunflower oil': 'oil sunflower', 'rapeseed oil': 'oil rapeseed', 'coconut oil': 'oil coconut',
  'sweet potatoes': 'sweet potato', squash: 'squash butternut', pumpkin: 'pumpkin', 'kidney beans': 'beans red kidney', 'red kidney beans': 'beans red kidney',
  aparagus: 'asparagus', 'aparagus tips': 'asparagus', 'asparagus tips': 'asparagus', 'green beans': 'beans green', 'runner beans': 'beans runner',
  'broad beans': 'beans broad', 
  'white fish': 'cod flesh only', 'frozen fish': 'cod flesh only', seafood: 'prawns', 'pork tenderloin': 'pork fillet', 'pork loin': 'pork loin',
  lomo: 'pork loin', solomillo: 'pork fillet', 'cured ham': 'ham', 'yogurt': 'yogurt plain', 'greek yogurt': 'yogurt greek style plain', 'gf toast': 'bread gluten free', 'gf bread': 'bread gluten free',
  'wholemeal toast': 'bread wholemeal', toast: 'bread white', 'mango chunks': 'mango', blueberry: 'blueberries', 'brussels sprouts': 'brussels sprouts',
  rusks: 'rusks', chard: 'chard swiss', leeks: 'leeks', leek: 'leeks', spinach: 'spinach', kale: 'curly kale', beetroot: 'beetroot',
  'pickled beetroot': 'beetroot pickled', 'pickled onion': 'onions pickled', pickles: 'gherkins', radish: 'radish red', radishes: 'radish red', lettuce: 'lettuce',
  'salad leaves': 'lettuce', 'mixed leaf salad': 'lettuce', 'lentils': 'lentils', 'oats': 'oats porridge', 'porridge oats': 'oats porridge',
  'white rice': 'rice white', rice: 'rice white', pasta: 'pasta white', spaghetti: 'pasta white', 'tomato sauce': 'tomato sauce',
  'canned tomato sauce': 'tomato sauce', 'chopped tomatoes': 'tomatoes canned', 'tinned tomatoes': 'tomatoes canned',
  egg: 'eggs chicken whole', eggs: 'eggs chicken whole', 'boiled egg': 'eggs chicken whole boiled', 'poached egg': 'eggs chicken whole poached',
  'chicken breast': 'chicken light meat', 'chicken thigh': 'chicken dark meat', 'chicken thighs': 'chicken dark meat', 'chicken drumsticks': 'chicken dark meat',
  'roasted chicken': 'chicken light meat roasted',
  'fresh cheese': 'cheese soft', 'cheese triangles': 'cheese spread', tofu: 'tofu soya bean steamed', seitan: 'seitan', paneer: 'paneer',
  walnut: 'walnuts', walnuts: 'walnuts', pecan: 'pecan nuts', pecans: 'pecan nuts', almonds: 'almonds', seeds: 'sunflower seeds',
  cranberries: 'cranberries dried', coffee: 'coffee infusion average', milk: 'milk semi-skimmed', butter: 'butter', flour: 'flour wheat white',
  wine: 'wine red', 'red wine': 'wine red', 'white wine': 'wine white', mushrooms: 'mushrooms white', mushroom: 'mushrooms white',
  carrots: 'carrots', carrot: 'carrots', onion: 'onions', onions: 'onions', 'red onion': 'onions', potatoes: 'potatoes old flesh only', potato: 'potatoes old flesh only',
  apple: 'apples eating', apples: 'apples eating', pear: 'pears', orange: 'oranges flesh only', oranges: 'oranges flesh only', kiwi: 'kiwi fruit', banana: 'bananas', tomatoes: 'tomatoes', tomato: 'tomatoes',
  broccoli: 'broccoli green', cabbage: 'cabbage average', celery: 'celery', cucumber: 'cucumber', garlic: 'garlic', salmon: 'salmon farmed flesh only', tuna: 'tuna canned',
  'red chillies': 'peppers capsicum chilli red', 'red chilli': 'peppers capsicum chilli red', 'green chillies': 'peppers capsicum chilli green',
  'green chilli': 'peppers capsicum chilli green', 'bird s eye chillies': 'peppers capsicum chilli red', 'bird s eye chilli': 'peppers capsicum chilli red',
  'scotch bonnet': 'peppers capsicum chilli red', jalapenos: 'peppers capsicum chilli green', jalapeno: 'peppers capsicum chilli green',
  'chili powder': 'chilli powder', 'chili flakes': 'chilli powder', 'chilli fakes': 'chilli powder', 'red pepper flakes': 'chilli powder',
  'flat-leaf parsley': 'parsley fresh', 'flat leaf parsley': 'parsley fresh', 'curly parsley': 'parsley fresh',
  'soured cream': 'dips sour cream based', 'sour cream': 'dips sour cream based', margarine: 'fat spread reduced 62 75 polyunsaturated',
  'iceberg lettuce': 'lettuce average', 'romaine lettuce': 'lettuce average', 'little gem': 'lettuce average', 'beefsteak tomatoes': 'tomatoes', 'cherry tomatoes': 'tomatoes',
  cornstarch: 'flour corn', cornflour: 'flour corn', 'streaky bacon': 'bacon rashers streaky raw', 'back bacon': 'bacon rashers back raw',
  'green onions': 'spring onions bulbs and tops', 'green onion': 'spring onions bulbs and tops', 'yellow onion': 'onions', 'white onion': 'onions', 'brown onion': 'onions',
  'garlic paste': 'garlic', 'garlic puree': 'garlic', 'ginger paste': 'ginger fresh', 'ginger puree': 'ginger fresh', 'garlic powder': 'garlic powder',
  'hot smoked paprika': 'paprika', 'tamarind paste': 'tamarind pulp', 'sea salt flakes': 'salt',
  chillies: 'peppers capsicum chilli red', chilli: 'peppers capsicum chilli red', chili: 'peppers capsicum chilli red', chilies: 'peppers capsicum chilli red',
  'chilli sauce': 'chilli sauce', 'sweet chilli sauce': 'chilli sauce', 'chilli con carne': 'chilli con carne', 'mint sauce': 'mint sauce',
  mint: 'mint fresh', dill: 'dill fresh', rosemary: 'rosemary fresh', 'lemon juice': 'lemon juice fresh', 'lime juice': 'lime juice fresh',
  'orange juice': 'orange juice freshly squeezed', 'lemon peel': 'lemon peel', 'lime peel': 'lemon peel', 'orange peel': 'lemon peel',
  chicken: 'chicken light meat', turkey: 'turkey light meat', 'turkey breast': 'turkey light meat', 'turkey slice': 'turkey light meat', beef: 'beef', pork: 'pork', lamb: 'lamb', steak: 'beef rump steak', 'lean beef': 'beef rump steak',
};

/** Words that say nothing about which food it is. */
const STOP = new Set(['of', 'the', 'and', 'with', 'a', 'an', 'fresh', 'frozen', 'organic', 'large', 'medium', 'small', 'chopped', 'diced',
  'sliced', 'finely', 'roughly', 'peeled', 'side', 'some', 'little', 'natural', 'skinless', 'boneless', 'to', 'taste', 'for', 'serving',
  'optional', 'extra', 'virgin', 'de', 'con', 'en', 'y', 'with', 'uncooked', 'cooked', 'x', 'g', 'ml', 'sauteed', 'cube', 'day', 'swap', 'carb', 'legume', 'mixed', 'or', 'oz',
  'tbsp', 'tsp', 'crushed', 'minced', 'grated', 'thinly', 'cut', 'into', 'wedges', 'chunks', 'pieces', 'cubes', 'cubed', 'halved', 'quartered',
  'torn', 'peeled', 'deveined', 'trimmed', 'drained', 'rinsed', 'washed', 'beaten', 'softened', 'melted', 'room', 'temperature', 'range',
  'freshly', 'kosher', 'coarse', 'flaky', 'sized', 'button', 'ready', 'readymade', 'prepared', 'sachet', 'pack', 'packet', 'jar', 'about',
  'approx', 'abt', 'plus', 'more', 'few', 'good', 'splash', 'knob', 'knobs', 'roasting', 'variety', 'clove', 'cloves', 'stick', 'sticks', 'bunch',
  'generous', 'deseeded', 'seeded', 'shredded', 'zest', 'ground', 'roughly', 'large', 'thick', 'thin', 'slices', 'bite', 'shaped', 'tablespoon', 'teaspoon', 'pressed', 'cm', 'inch', 'removed', 'stem', 'stems', 'stalk', 'stalks', 'skin', 'on', 'thumb', 'pan', 'fry', 'frying', 'drizzling', 'drizzle', 'greasing', 'serve', 'brushing']);
/** Words that narrow the choice when present but don't rule a food out when missing. */
const SOFT = new Set(['raw', 'dry', 'dried', 'boiled', 'steamed', 'grilled', 'roasted', 'baked', 'poached', 'whole', 'plain', 'lean', 'low',
  'fat', 'light', 'free', 'average', 'meat', 'only', 'flesh', 'extra', 'reduced', 'leaves', 'leave', 'leaf', 'lengthways', 'long', 'ways', 'sprigs', 'sprig']);

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('es') && /(oes|ches|shes|sses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

interface Indexed {
  food: Food;
  words: string[];
  head: string[];
  len: number;
}
const indexCache = new WeakMap<Food[], Indexed[]>();
function index(foods: Food[]): Indexed[] {
  let idx = indexCache.get(foods);
  if (!idx) {
    idx = foods.map((food) => {
      const n = norm(food.name);
      const words = n.split(/[\s,/-]+/).filter(Boolean).map(stem);
      const head = norm(food.name.split(',')[0]).split(/[\s/-]+/).filter(Boolean).map(stem);
      return { food, words, head, len: words.length };
    });
    indexCache.set(foods, idx);
  }
  return idx;
}

/** The search words for an ingredient name, after swapping in CoFID's words. */
export function queryWords(name: string): string[] {
  let n = norm(name).replace(/\bgf\b/g, 'gf');
  // longest synonym phrases first
  const keys = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/[-/]/g, '.')}\\b`, 'g');
    if (re.test(n)) {
      n = n.replace(re, ` ${SYNONYMS[k]} `);
      break;
    }
  }
  return [...new Set(n.split(/[\s,/-]+/).filter((w) => w && !STOP.has(w) && !/^\d/.test(w)).map(stem))];
}

/** Words that change which food it is: a match can't leave them out ("black beans" aren't butter beans). */
const MUST = new Set(['black', 'red', 'green', 'white', 'brown', 'yellow', 'sweet', 'smoked', 'wholemeal', 'gluten', 'soya', 'oat', 'almond', 'coconut', 'goat', 'kidney', 'butter']);

/** "chick" matches "chicken", "bread" doesn't match "breadfruit". */
const close = (x: string, w: string) => x === w || (w.length >= 4 && x.startsWith(w) && x.length - w.length <= 2);

export interface Match {
  food: Food;
  score: number;
}

/**
 * Rank foods for an ingredient. Prefers raw/dried versions unless the line says cooked, and the
 * plainest name (fewest extra words). Returns the best few.
 */
export function searchFoods(foods: Food[], name: string, opts: { state?: 'raw' | 'dry' | 'cooked'; limit?: number } = {}): Match[] {
  const all = queryWords(name);
  const q = all.filter((w) => !SOFT.has(w));
  const soft = all.filter((w) => SOFT.has(w));
  if (!q.length) return [];
  const raw = norm(name);
  const phrase = all.join(' ');
  const wantCooked = opts.state === 'cooked' || /\b(boiled|cooked|grilled|roasted|baked|poached|fried|steamed|canned|tinned|pickled|smoked)\b/.test(raw);
  const results: Match[] = [];
  for (const it of index(foods)) {
    let hits = 0;
    let headHits = 0;
    let missedKey = false;
    for (const w of q) {
      if (it.words.some((x) => close(x, w))) hits++;
      else if (MUST.has(w)) missedKey = true;
      if (it.head.some((x) => close(x, w))) headHits++;
    }
    if (missedKey) continue;
    // every word must match (one may be missing from a longer description)
    if (!headHits || hits < q.length - (q.length >= 3 ? 1 : 0)) continue;
    // a dish of several foods ("Rice and black-eye beans") is not what someone means by one of them
    if (it.head.includes('and') && !it.head.every((x) => x === 'and' || q.some((w) => close(x, w)) || soft.includes(x))) continue;
    const name = it.food.name.toLowerCase();
    let score = hits * 10 + 6 + headHits - (q.length - hits) * 8 - it.len * 0.6;
    // a dish whose name starts with other foods ("Rice and red kidney beans") is not the food itself
    score -= it.head.filter((x) => x !== 'and' && x !== 'with' && !q.some((w) => close(x, w)) && !soft.includes(x)).length * 4;
    for (const w of soft) if (it.words.includes(w)) score += 4;
    if (it.food.source !== 'cofid') score += 3; // our own and edited foods first when equally good
    if (norm(it.food.name) === phrase) score += 8;
    if (it.words.includes('average')) score += 2; // CoFID's generic version
    if (wantCooked) {
      if (/boiled|cooked|grilled|roasted|baked|poached|canned|steamed/.test(name)) score += 3;
      if (/\braw\b/.test(name)) score -= 3;
    } else if (/\braw\b/.test(name)) score += 5;
    if (opts.state === 'dry' && /\bdried\b/.test(name)) score += 4;
    if (opts.state !== 'dry' && !soft.includes('dried') && !/\bdried\b/.test(raw) && /\bdried\b/.test(name) && !/\b(lentil|pea|chick|pasta|noodle|rice)/.test(name)) score -= 6;
    if (!/fruit|flavour/.test(raw) && /\b(fruit|flavoured?|toffee|hazelnut)\b/.test(name) && /^yogurt|^fromage/.test(name)) score -= 4;
    if (/weighed with|homemade|retail|takeaway|fried in|in batter|coated|stuffed|with sauce|ready meal/.test(name)) score -= 6;
    if (/\bin salted water|salt added|\bsweetened|in syrup|with sugar/.test(name)) score -= 3;
    results.push({ food: it.food, score });
  }
  results.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return results.slice(0, opts.limit ?? 8);
}

/** Plain search for the Foods screen: every word must appear. */
export function findFoods(foods: Food[], query: string, limit = 60): Food[] {
  const q = norm(query).split(' ').filter(Boolean).map(stem);
  if (!q.length) return [];
  const out: { f: Food; s: number }[] = [];
  for (const it of index(foods)) {
    if (!q.every((w) => it.words.some((x) => x.startsWith(w)))) continue;
    const s = (q.every((w) => it.head.some((x) => x.startsWith(w))) ? 0 : 10) + it.len + (it.food.source !== 'cofid' ? -5 : 0);
    out.push({ f: it.food, s });
  }
  return out.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.f);
}
