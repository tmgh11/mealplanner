import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readXlsx } from './xlsx';
import { cellToMeal, findMenus } from './importSheet';
import { buildFoods, type CofidRow } from './foods';
import cofid from '../../public/data/cofid.json';

const foods = buildFoods((cofid as unknown as { foods: CofidRow[] }).foods, []);
const name = (id?: string | null) => foods.find((f) => f.id === id)?.name;

/** A tiny .xlsx with one sheet per entry; cells as rows of strings (shared strings, like Excel writes). */
function makeXlsx(sheets: Record<string, string[][]>): Uint8Array {
  const shared: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i: number) => String.fromCharCode(65 + i);
  const files: Record<string, Uint8Array> = {};
  const names = Object.keys(sheets);
  names.forEach((n, i) => {
    const rows = sheets[n]
      .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => (v === '' ? '' : `<c r="${col(c)}${r + 1}" t="s"><v>${shared.push(v) - 1}</v></c>`)).join('')}</row>`)
      .join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`);
  });
  files['xl/sharedStrings.xml'] = strToU8(`<sst>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`);
  files['xl/workbook.xml'] = strToU8(`<workbook><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  return zipSync(files);
}

describe('reading .xlsx', () => {
  it('reads sheet names and cell text, including & and line breaks', () => {
    const sheets = readXlsx(makeXlsx({ 'Week 1': [['', 'Breakfast', 'Lunch'], ['Mon', 'Toast & jam', 'Soup\nBread']] }));
    expect(sheets[0].name).toBe('Week 1');
    expect(sheets[0].rows[1]).toEqual(['Mon', 'Toast & jam', 'Soup\nBread']);
  });
});

describe('cells to meals', () => {
  it('keeps notes as notes and spots leftovers', () => {
    expect(cellToMeal('Pizza night!!!', 'dinner', 'both', foods)).toMatchObject({ content: { type: 'note', text: 'Pizza night!!!' } });
    expect(cellToMeal('Leftover soup', 'lunch', 'both', foods)).toMatchObject({ leftovers: true });
  });
  it('turns amounts into matched items and keeps the label', () => {
    const m = cellToMeal('Legume Day: 50g (dry) Lentils with 120g Carrots/Onions  + 150g Chicken breast.', 'lunch', 'nuria', foods)!;
    expect(m.label).toBe('Legume Day');
    expect(m.who).toBe('nuria');
    if (m.content.type !== 'items') throw new Error('expected items');
    expect(m.content.ingredients.map((i) => i.text)).toEqual(['50g (dry) Lentils', '120g Carrots/Onions', '150g Chicken breast']);
    expect(name(m.content.ingredients[0].foodId)).toMatch(/^Lentils.*dried, raw/);
    expect(m.content.ingredients.map((i) => i.grams)).toEqual([50, 120, 150]);
  });
  it('splits off sides', () => {
    const m = cellToMeal('150g Salmon (Oily Fish - 1/3) , 120g Green beans. Side: Broccoli and Radishes.', 'lunch', 'both', foods)!;
    if (m.content.type !== 'items') throw new Error('expected items');
    expect(m.content.ingredients.map((i) => i.text)).toEqual(['150g Salmon (Oily Fish - 1/3)', '120g Green beans', 'Broccoli and Radishes']);
  });
});

describe('finding menus in a workbook', () => {
  it('reads a labelled week, skips number rows and spare ideas, and splits a second block', () => {
    const sheets = readXlsx(makeXlsx({
      trial: [
        ['', 'Breakfast', 'Value', 'Lunch', 'Value', 'Dinner'],
        ['Mon', '1 boiled egg', '72', '100g chicken', '106', 'Pizza night'],
        ['', '', '6', '', '20', ''],
        ['Tue', '30g oats', '114', '', '', 'Out in town'],
        ['', '', '', 'Idea: 100g potatoes', '', ''],
        ['Wed', '1 boiled egg', '', '', '', ''],
        ['Mon', '60g blueberries', '', '', '', ''],
      ],
      Notes: [['nothing useful here']],
    }));
    const menus = findMenus(sheets, 'both', foods);
    expect(menus.map((m) => `${m.name}: ${m.days.length}`)).toEqual(['trial (1): 3', 'trial (2): 1']);
    expect(menus[0].dayNames).toEqual(['Mon', 'Tue', 'Wed']);
    expect(menus[0].days[0].meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(menus[0].days[1].meals.map((m) => `${m.slot}:${m.content.type}`)).toEqual(['breakfast:items', 'dinner:note']);
  });
  it('reads a sheet whose first column is Breakfast (no day labels)', () => {
    const sheets = readXlsx(makeXlsx({ 'trial 2.0': [['Breakfast', 'Lunch'], ['30g oats', '100g rice'], ['422', '300'], ['1 boiled egg', '100g chicken']] }));
    const [m] = findMenus(sheets, 'nuria', foods);
    expect(m.days).toHaveLength(2);
    expect(m.dayNames).toEqual(['', '']);
  });
});
