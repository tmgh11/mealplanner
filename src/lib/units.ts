/**
 * US measures → UK ones. American recipes give cups, pounds, ounces and sticks of butter; here
 * they're rewritten as grams and millilitres, the way a UK recipe would say them.
 *
 * Cups are volumes. Dry goods with a well-known weight per cup (flour, sugar, rice…) become grams;
 * everything else becomes ml, which is exact and can be measured in a jug ("1 cup chopped
 * parsley" is 240 ml of parsley, not 240 g).
 */

/** Grams in one US cup, for things usually weighed in the UK. First match wins. */
const CUP_GRAMS: [RegExp, number][] = [
  [/\b(plain|all[- ]purpose|self[- ]raising|bread|wholemeal|whole[- ]wheat|spelt|rye|cake|00|strong)?\s*flour\b/i, 125],
  [/\bicing sugar|powdered sugar|confectioners/i, 120],
  [/\bbrown sugar|muscovado|demerara/i, 200],
  [/\b(caster|granulated|white)?\s*sugar\b/i, 200],
  [/\bbutter\b(?!milk|nut|bean)/i, 227],
  [/\bcocoa\b/i, 85],
  [/\bground almonds|almond flour|almond meal/i, 95],
  [/\b(rolled |porridge |jumbo )?oats\b/i, 90],
  [/\bquinoa\b/i, 170],
  [/\b(arborio|basmati|jasmine|long[- ]grain|short[- ]grain|brown|white|risotto|sushi)?\s*rice\b(?! (vinegar|wine|noodles|paper|milk))/i, 185],
  [/\blentils\b/i, 190],
  [/\b(panko|bread ?crumbs|breadcrumbs)\b/i, 60],
  [/\b(grated )?(parmesan|pecorino)\b/i, 100],
  [/\b(grated |shredded )?(cheddar|mozzarella|gruyere|gruyère|cheese)\b/i, 110],
  [/\bchocolate chips|chocolate chunks\b/i, 170],
  [/\b(walnuts|pecans|almonds|cashews|hazelnuts|peanuts|pistachios|nuts)\b/i, 120],
  [/\b(raisins|sultanas|currants|cranberries|dried fruit)\b/i, 150],
  [/\b(desiccated coconut|shredded coconut)\b/i, 80],
  [/\bcornflour|cornstarch\b/i, 120],
];

const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
/** "1 1/2", "1½", "3/4", "0.75", "½" */
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])`;
const num = (s: string): number => {
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const uni = s.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])$/);
  if (uni) return (uni[1] ? +uni[1] : 0) + FRAC[uni[2]];
  return parseFloat(s);
};

/** Rounded the way a UK recipe would: to the nearest 5 (113 g → 115 g), 50 over a kilo. */
const tidy = (n: number) => (n < 20 ? Math.round(n) : n < 1000 ? Math.round(n / 5) * 5 : Math.round(n / 50) * 50);
const grams = (n: number) => (n >= 1000 ? `${+(tidy(n) / 1000).toFixed(2)}kg` : `${tidy(n)}g`);
const mls = (n: number) => (n >= 1000 ? `${+(tidy(n) / 1000).toFixed(2)}l` : `${tidy(n)}ml`);

const US_UNIT = String.raw`(?:cups?|c\.|fl\.?\s*oz|fluid ounces?|lbs?\.?|pounds?|oz\.?|ounces?|sticks?|quarts?|qts?\.?)`;
const AMOUNT = new RegExp(String.raw`(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*(${US_UNIT})(?=[\s,.)]|$)`, 'gi');
const METRIC = String.raw`\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b`;

/** True if a line has a US measure in it. */
export const hasUsUnits = (text: string) => new RegExp(String.raw`${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*${US_UNIT}(?=[\s,.)]|$)`, 'i').test(text);

/** The ingredient line with US measures rewritten in grams and ml. Unchanged if there are none. */
export function toMetric(text: string): string {
  if (!hasUsUnits(text)) return text;
  let t = text;
  // the recipe already gives both: keep the metric one ("2 cups (480ml) stock", "500g (1 lb) pork")
  t = t.replace(new RegExp(String.raw`${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*${US_UNIT}\s*\((?:about |approx\.? |~)?(${METRIC})\)`, 'gi'), '$1');
  t = t.replace(new RegExp(String.raw`(${METRIC})\s*\((?:about |approx\.? |~)?${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*${US_UNIT}\)`, 'gi'), '$1');
  const what = t;
  t = t.replace(AMOUNT, (_m, a: string, b: string | undefined, unitRaw: string) => {
    const unit = unitRaw.toLowerCase().replace(/\.$/, '');
    const conv = (n: number): { v: number; to: 'g' | 'ml' } => {
      if (/^(lbs?|pounds?)$/.test(unit)) return { v: n * 453.6, to: 'g' };
      if (/^(fl\s*oz|fluid ounces?)$/.test(unit.replace('.', ''))) return { v: n * 29.57, to: 'ml' };
      if (/^(oz|ounces?)$/.test(unit)) return { v: n * 28.35, to: 'g' };
      if (/^sticks?$/.test(unit)) return { v: n * 113, to: 'g' };
      if (/^(quarts?|qts?)$/.test(unit)) return { v: n * 946, to: 'ml' };
      // cups
      const dry = CUP_GRAMS.find(([re]) => re.test(what));
      return dry ? { v: n * dry[1], to: 'g' } : { v: n * 240, to: 'ml' };
    };
    const x = conv(num(a));
    const fmt = (v: number) => (x.to === 'g' ? grams(v) : mls(v));
    if (!b) return fmt(x.v);
    const y = conv(num(b));
    const [lo, hi] = [fmt(x.v), fmt(y.v)];
    const unitOf = (s: string) => s.replace(/^[\d.]+/, '');
    return unitOf(lo) === unitOf(hi) ? `${lo.replace(/[a-z]+$/, '')}–${hi}` : `${lo}–${hi}`;
  });
  // "1 (410g) can" reads fine; "2 sticks butter" → "225g butter"; "of" left dangling: "450g of beef" is fine too
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** Oven temperatures in a method: "350°F" → "180°C (fan 160°C)". */
export function methodToMetric(method: string): string {
  return method.replace(/(\d{3})\s*°?\s*(?:degrees\s*)?F(?:ahrenheit)?\b(?!\s*\/\s*\d)/g, (_m, f: string) => {
    const c = Math.round(((+f - 32) * 5) / 9 / 10) * 10;
    return `${c}°C (fan ${c - 20}°C)`;
  });
}
