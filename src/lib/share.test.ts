import { describe, expect, it } from 'vitest';
import { recipeAsText } from './share';
import type { Recipe } from './types';

const r = {
  id: 'r', kind: 'recipe', title: 'Lentil *stew*', owner: 'both', servings: 4, prepMins: 15, cookMins: 40, tags: [],
  ingredients: [
    { id: '1', text: '200g red lentils' },
    { id: '2', text: 'For the topping:', heading: true },
    { id: '3', text: 'Greek yoghurt' },
  ],
  method: 'Rinse the lentils.\n\n_For the topping_\n\nStir in the yoghurt.',
  notes: 'Freezes well.',
  sourceUrl: 'https://example.com/stew',
  updatedAt: 1,
} as Recipe;

describe('recipeAsText', () => {
  it('lays a recipe out for WhatsApp', () => {
    expect(recipeAsText(r)).toBe(
      [
        '*Lentil stew*',
        'Serves 4 · Prep 15 min · Cook 40 min',
        '',
        '*Ingredients*',
        '• 200g red lentils',
        '',
        '_For the topping_',
        '• Greek yoghurt',
        '',
        '*Method*',
        '1. Rinse the lentils.',
        '',
        '_For the topping_',
        '2. Stir in the yoghurt.',
        '',
        '*Notes*',
        'Freezes well.',
        '',
        'https://example.com/stew',
      ].join('\n'),
    );
  });
  it('leaves out what a recipe doesn’t have', () => {
    expect(recipeAsText({ ...r, prepMins: undefined, cookMins: undefined, totalMins: 90, ingredients: [], method: '', notes: '', sourceUrl: undefined })).toBe('*Lentil stew*\nServes 4 · 1 hr 30 min');
  });
});
