/**
 * Reading ingredient text: Nuria's spreadsheet cells ("120g chicken, 100g broccoli, 7.5ml olive
 * oil") and recipe ingredient lines from websites ("2 tbsp olive oil", "1 large onion, chopped").
 */

export interface ParsedLine {
  /** the text as given, trimmed */
  text: string;
  qty?: number;
  /** canonical unit: g, ml, tsp, tbsp, cup, oz, lb, pinch, handful, or a count word (clove, slice, tin…) */
  unit?: string;
  /** the food words, e.g. "olive oil" */
  name: string;
  /** raw / dry / cooked, when the line says so */
  state?: 'raw' | 'dry' | 'cooked';
  /** what followed a comma or sat in brackets, e.g. "chopped" */
  note?: string;
  /** a weight given alongside a count, e.g. "1.5/225g zucchini" or "1 tin (400g) tomatoes" */
  grams?: number;
}

const FRACTIONS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };

/** Unit words → canonical unit. Weight and volume units, then count words. */
const UNITS: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  cl: 'cl', l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  dessertspoon: 'dsp', dessertspoons: 'dsp', dsp: 'dsp',
  cup: 'cup', cups: 'cup',
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  pinch: 'pinch', pinches: 'pinch', handful: 'handful', handfuls: 'handful',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice',
  tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin', fillet: 'fillet', fillets: 'fillet',
  rasher: 'rasher', rashers: 'rasher', cube: 'cube', cubes: 'cube', piece: 'piece', pieces: 'piece',
  bunch: 'bunch', sprig: 'sprig', sprigs: 'sprig', stick: 'stick', sticks: 'stick', head: 'head',
  large: 'large', medium: 'medium', small: 'small', triangle: 'triangle', triangles: 'triangle',
  pot: 'pot', pots: 'pot', scoop: 'scoop', scoops: 'scoop',
};
export const WEIGHT_UNITS = new Set(['g', 'kg', 'oz', 'lb']);
export const VOLUME_UNITS = new Set(['ml', 'cl', 'l', 'tsp', 'tbsp', 'dsp', 'cup']);

const WORD_QTY: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5 };

function readNumber(s: string): number | undefined {
  s = s.replace(',', '.');
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : undefined;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\/\d+(?:\.\d+)?|\s*[-–]\s*\d+(?:[.,]\d+)?)?`;

/** Read one ingredient. */
export function parseLine(input: string): ParsedLine {
  const text = input.trim().replace(/\s+/g, ' ');
  let s = text.replace(/[½¼¾⅓⅔⅛]/g, (c) => ` ${FRACTIONS[c]}`).replace(/(\d) (\d\/\d)/, '$1 $2').trim();
  s = s.replace(/^[-•*·]\s*/, '').replace(/[;,]+$/, '');
  // amount at the end: "fish sauce 1 tbsp", "bean sprouts 100g" → "1 tbsp fish sauce"
  const tailAmount = s.match(/^([A-Za-z][^\d]*?)\s+(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|tbsp|tsp|tablespoons?|teaspoons?|cups?)?)\s*$/i);
  if (tailAmount) s = `${tailAmount[2]} ${tailAmount[1]}`;
  // "garlic x2 crushed" → "2 garlic crushed"
  const times = s.match(/^([A-Za-z][^\d]*?)\s+x\s?(\d+)\b(.*)$/i);
  if (times) s = `${times[2]} ${times[1]}${times[3]}`;
  const out: ParsedLine = { text, name: '' };

  // "1.5/225g zucchini": a count with its weight
  const countWeight = s.match(new RegExp(`^(${NUM})\\s*\\/\\s*(\\d+(?:[.,]\\d+)?)\\s*g\\b\\s*(.*)$`, 'i'));
  if (countWeight) {
    out.qty = readNumber(countWeight[1]);
    out.grams = readNumber(countWeight[2]);
    s = countWeight[3];
  } else {
    const q = s.match(new RegExp(`^(${NUM})\\s*`, 'i'));
    if (q) {
      out.qty = readNumber(q[1].trim());
      s = s.slice(q[0].length);
    } else {
      const w = s.match(/^(a|an|one|two|three|four|five|six|half)\s+(?:of\s+)?/i);
      if (w) {
        out.qty = WORD_QTY[w[1].toLowerCase()];
        s = s.slice(w[0].length);
      }
    }
  }

  // unit, attached ("120g") or as the next word ("2 tbsp", "4 cloves")
  const u = s.match(/^([a-zA-Z]+)\.?(?=[\s(]|$)\s*/);
  if (u && UNITS[u[1].toLowerCase()] && (out.qty != null || !WEIGHT_UNITS.has(UNITS[u[1].toLowerCase()]))) {
    const unit = UNITS[u[1].toLowerCase()];
    // "large/medium/small" only count as a unit before a food word, e.g. "1 large onion"
    out.unit = unit;
    s = s.slice(u[0].length);
    if (out.qty == null) out.qty = 1; // "slice gf toast" = 1 slice
  }
  s = s.replace(/^of\s+/i, '');

  // a weight in brackets after a count: "1 tin (400g) tomatoes"
  const inner = s.match(/\((\d+(?:[.,]\d+)?)\s*g\)/i);
  if (inner && out.grams == null && (!out.unit || !WEIGHT_UNITS.has(out.unit))) {
    out.grams = readNumber(inner[1]);
    s = s.replace(inner[0], ' ');
  }

  // state words: (dry), uncooked, cooked…
  const lower = s.toLowerCase();
  if (/\b(dry|dried|uncooked)\b/.test(lower)) out.state = 'dry';
  else if (/\b(raw)\b/.test(lower)) out.state = 'raw';
  else if (/\b(cooked|boiled|steamed|roasted|grilled)\b/.test(lower)) out.state = 'cooked';
  s = s.replace(/\((dry|uncooked|raw|cooked)\)/gi, ' ');

  // notes: brackets, then anything after the first comma or " - "
  const notes: string[] = [];
  s = s.replace(/\(([^)]*)\)/g, (_, n: string) => {
    if (n.trim()) notes.push(n.trim());
    return ' ';
  });
  const comma = s.search(/,| - | – /);
  if (comma >= 0) {
    notes.unshift(s.slice(comma + 1).replace(/^[-–\s]+/, '').trim());
    s = s.slice(0, comma);
  }

  // "2 garlic cloves": the count word at the end
  const tail = s.trim().match(/^(.*\S)\s+([a-zA-Z]+)$/);
  if (!out.unit && tail && ['clove', 'slice', 'fillet', 'tin', 'rasher', 'cube', 'triangle'].includes(UNITS[tail[2].toLowerCase()] ?? '')) {
    out.unit = UNITS[tail[2].toLowerCase()];
    s = tail[1];
    if (out.qty == null) out.qty = 1;
  }

  // "2 garlic cloves crushed": the count word inside the name
  if (!out.unit && out.qty != null) {
    const inner = s.match(/\b(cloves?|fillets?|tins?|cans?|rashers?)\b/i);
    if (inner) {
      out.unit = UNITS[inner[1].toLowerCase()];
      s = s.replace(inner[0], ' ');
    }
  }

  out.name = s.replace(/\s+/g, ' ').replace(/[.;:]+$/, '').trim();
  const note = notes.filter(Boolean).join(', ');
  if (note) out.note = note;
  return out;
}

/**
 * Split a list of ingredients into lines. Recipe text is one per line; Nuria's cells are
 * comma-separated ("120g chicken, 100g broccoli"), sometimes with a missing comma
 * ("2 garlic cloves7.5ml olive oil"). Commas inside brackets don't split.
 */
export function splitItems(text: string, commas = true): string[] {
  let s = text.replace(/\r/g, '');
  // a weight stuck to the previous word: "cloves7.5ml"
  s = s.replace(/([a-zA-Z])(\d+(?:\.\d+)?\s*(?:g|ml|kg)\b)/g, '$1\n$2');
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '\n' || (commas && depth === 0 && (ch === ',' || ch === ';'))) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && !/^[-–.]+$/.test(x));
}

/** A recipe's ingredient box: one per line, but a single long line of commas is a list. */
export function splitRecipeIngredients(text: string): string[] {
  const lines = splitItems(text, false);
  if (lines.length === 1 && /\d\s*(g|ml)\b.*,.*\d/.test(lines[0])) return splitItems(text, true);
  return lines;
}

/** For display: "120 g", "2 tbsp", "4 cloves", "½". */
export function formatQty(qty?: number, unit?: string): string {
  if (qty == null) return unit ?? '';
  const nice = (n: number) => {
    const fr: Record<string, string> = { '0.5': '½', '0.25': '¼', '0.75': '¾', '0.33': '⅓', '0.67': '⅔' };
    const whole = Math.floor(n);
    const rest = Math.round((n - whole) * 100) / 100;
    if (fr[String(rest)]) return `${whole || ''}${fr[String(rest)]}`;
    return String(Math.round(n * 10) / 10);
  };
  if (!unit) return nice(qty);
  if (unit === 'g' || unit === 'ml' || unit === 'kg' || unit === 'l') return `${nice(qty)} ${unit}`;
  const plural = qty > 1 && !['tsp', 'tbsp', 'dsp', 'oz', 'lb', 'medium', 'large', 'small'].includes(unit);
  return `${nice(qty)} ${unit}${plural ? (unit.endsWith('ch') ? 'es' : 's') : ''}`;
}

/** "FOR THE SAUCE:", "Nuria added:", "Topping" in capitals: a heading in an ingredient list, not a food. */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || /\d/.test(t)) return false;
  if (/:$/.test(t) && t.length <= 40) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 6;
}
