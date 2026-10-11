import { describe, expect, it } from 'vitest';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { paprikaToRecipe, parseServings, readPaprika } from './paprika';
import { buildFoods, type CofidRow } from './foods';
import cofid from '../../public/data/cofid.json';

const foods = buildFoods((cofid as unknown as { foods: CofidRow[] }).foods, []);
const sample = {
  uid: 'ABC-123', name: 'Lentil Soup', servings: 'Serves 4-6 easy', source: 'BBC Good Food', source_url: 'https://www.bbcgoodfood.com/recipes/x',
  categories: ['Soup', ' Vegetarian '], rating: 4, photo_data: 'aGVsbG8=', prep_time: '10 mins', cook_time: '30 mins',
  ingredients: 'FOR THE SOUP:\n200g red lentils\n2 garlic cloves crushed\n1l hot vegetable stock\nsalt and pepper\n',
  directions: 'Fry the garlic.\n\n\n\nAdd everything.', notes: 'Freezes well', description: '',
};
const file = (r: object) => gzipSync(strToU8(JSON.stringify(r)));

describe('reading a Paprika export', () => {
  it('reads a .paprikarecipes zip of gzipped recipes, and a single recipe', () => {
    const zip = zipSync({ 'Lentil Soup.paprikarecipe': file(sample), 'Other.paprikarecipe': file({ ...sample, uid: 'B', name: 'Other' }) });
    expect(readPaprika(zip).map((r) => r.name).sort()).toEqual(['Lentil Soup', 'Other']);
    expect(readPaprika(file(sample))[0].uid).toBe('ABC-123');
    expect(() => readPaprika(strToU8('nonsense'))).toThrow();
  });
  it('picks the number out of servings text', () => {
    expect(parseServings('Serves 4 easy')).toBe(4);
    expect(parseServings('Serves 4-6')).toBe(4);
    expect(parseServings('Cuts into 10 slices')).toBe(10);
    expect(parseServings('')).toBeUndefined();
  });
  it('turns it into one of our recipes', () => {
    const r = paprikaToRecipe(sample, 'both', foods, 'tom', () => 'id1');
    expect(r).toMatchObject({
      title: 'Lentil Soup', owner: 'both', servings: 4, tags: ['Soup', 'Vegetarian'], rating: 4, importId: 'paprika:ABC-123',
      sourceUrl: 'https://www.bbcgoodfood.com/recipes/x', photo: 'data:image/jpeg;base64,aGVsbG8=', method: 'Fry the garlic.\n\nAdd everything.',
    });
    expect(r.notes).toContain('Freezes well');
    expect(r.notes).toContain('Prep: 10 mins');
    expect(r.ingredients.map((i) => [i.text, i.heading ?? false, i.foodId === null])).toEqual([
      ['FOR THE SOUP', true, true],
      ['200g red lentils', false, false],
      ['2 garlic cloves crushed', false, false],
      ['1l hot vegetable stock', false, false],
      ['salt and pepper', false, true],
    ]);
  });
});
