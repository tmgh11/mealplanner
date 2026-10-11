/**
 * Turning Nuria's spreadsheet into menus. Each sheet has a header row with Breakfast / Lunch /
 * Snacks / Dinner columns and one row per day underneath (rows of numbers in between are ignored:
 * nutrition is worked out again from the UK food data). Weekday labels in the first column
 * ("Mon", "Tue"…) mark the days; when they start again, a second menu begins. Rows without a
 * label in a sheet that has labels are spare ideas, and are skipped.
 */
import type { Sheet } from './xlsx';
import type { Food, Ingredient, MealBody, MenuDay, Slot, Who } from './types';
import { resolveLine } from './ingredients';
import { splitItems } from './parse';

export interface FoundMenu {
  key: string;
  name: string;
  sheet: string;
  days: MenuDay[];
  /** what the first column called each day, e.g. "Mon" or "28th Dec" */
  dayNames: string[];
}

const SLOT_HEADERS: [RegExp, Slot][] = [
  [/^breakfast$/i, 'breakfast'],
  [/^lunch$/i, 'lunch'],
  [/^snacks?$/i, 'snacks'],
  [/^dinner$/i, 'dinner'],
];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekday = (s: string) => WEEKDAYS.indexOf(s.trim().toLowerCase().slice(0, 3));

/** The header row and which column holds which meal. */
function findHeader(rows: string[][]): { row: number; cols: [number, Slot][] } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cols: [number, Slot][] = [];
    (rows[r] ?? []).forEach((cell, c) => {
      const hit = SLOT_HEADERS.find(([re]) => re.test(cell.trim()));
      if (hit) cols.push([c, hit[1]]);
    });
    if (cols.length >= 2) return { row: r, cols };
  }
  return null;
}

const HAS_AMOUNT = /\d+(?:[.,]\d+)?\s*(g|ml|kg)\b|\b\d+(?:\/\d+)?\s+(?:[a-z]+\s+)?(egg|eggs|clove|cloves|slice|slices|tin|fillet)\b|\bslice\b|\begg\b/i;

/**
 * One cell → a meal. Cells with amounts become a list of items (each matched to a food); cells
 * without ("Pizza night!!!", "Out in town", a recipe link) stay as a note. A leading
 * "Legume Day:" or "Carb Swap:" becomes the meal's label.
 */
export function cellToMeal(text: string, slot: Slot, who: Who, foods: Food[]): MealBody | null {
  let s = text.replace(/\r/g, '').trim();
  if (!s) return null;
  let label: string | undefined;
  const lab = s.match(/^([A-Za-z][^:\n]{1,24}?):\s+(?=\S)/);
  if (lab && !/^side$/i.test(lab[1].trim())) {
    label = lab[1].trim();
    s = s.slice(lab[0].length);
  }
  const leftovers = /^leftovers?\b/i.test(s);
  if (!HAS_AMOUNT.test(s)) {
    return { slot, who, content: { type: 'note', text: s }, label, leftovers: leftovers || undefined };
  }
  // "50g Lentils with 120g Carrots + 150g Chicken. Side: Spinach." → one item per part
  const prepared = s
    .replace(/\s+\+\s+/g, ', ')
    .replace(/\s+with\s+(?=\d)/gi, ', ')
    .replace(/\s+and\s+(?=\d)/gi, ', ')
    .replace(/\.\s*Side(?:s)?\s*(?::|of)\s*/gi, ', ')
    .replace(/^Side(?:s)?\s*(?::|of)\s*/gi, '')
    .replace(/\.(\s|$)/g, '$1');
  const ingredients: Ingredient[] = splitItems(prepared).map((line) => {
    const r = resolveLine(line.replace(/^Side(?:s)?\s*(?::|of)\s*/i, ''), foods);
    return r.ingredient;
  });
  return { slot, who, content: { type: 'items', ingredients }, label };
}

export function findMenus(sheets: Sheet[], who: Who, foods: Food[]): FoundMenu[] {
  const out: FoundMenu[] = [];
  for (const sheet of sheets) {
    const h = findHeader(sheet.rows);
    if (!h) continue;
    const dayRows: { r: number; name: string }[] = [];
    // the first column names the days, unless it's a meal column itself
    const labelCol = h.cols.some(([c]) => c === 0) ? -1 : 0;
    const labelOf = (row: string[]) => (labelCol < 0 ? '' : (row[labelCol] ?? '').trim());
    const labelled = sheet.rows.slice(h.row + 1).some((row) => labelOf(row) && h.cols.some(([c]) => (row[c] ?? '').trim()));
    for (let r = h.row + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const hasMeal = h.cols.some(([c]) => (row[c] ?? '').trim() && !/^[\d.,=+\s-]+$/.test(row[c]));
      if (!hasMeal) continue;
      const name = labelOf(row);
      if (labelled && !name) continue; // spare ideas below the plan
      dayRows.push({ r, name });
    }
    // split into blocks when the weekdays start again
    const blocks: { r: number; name: string }[][] = [];
    let prev = 99;
    for (const d of dayRows) {
      const w = weekday(d.name);
      if (!blocks.length || (w >= 0 && prev >= 0 && w <= prev)) blocks.push([]);
      blocks.at(-1)!.push(d);
      prev = w;
    }
    blocks.forEach((block, i) => {
      const days: MenuDay[] = block.map((d) => ({
        meals: h.cols
          .map(([c, slot]) => cellToMeal(sheet.rows[d.r][c] ?? '', slot, who, foods))
          .filter((m): m is MealBody => Boolean(m)),
      }));
      out.push({
        key: `${sheet.name}#${i}`,
        name: blocks.length > 1 ? `${sheet.name} (${i + 1})` : sheet.name,
        sheet: sheet.name,
        days,
        dayNames: block.map((d) => d.name),
      });
    });
  }
  return out;
}
