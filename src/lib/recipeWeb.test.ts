import { describe, expect, it } from 'vitest';
import { findRecipeNode, findUrl, ldJsonBlocks, webRecipeFrom, webToRecipe } from './recipeWeb';
import { buildFoods, type CofidRow } from './foods';
import cofid from '../../public/data/cofid.json';

const foods = buildFoods((cofid as unknown as { foods: CofidRow[] }).foods, []);

// Shaped like a real BBC Good Food / WordPress (Yoast) page: Recipe inside an @graph, instructions as HowToSteps
const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
{"@type":["Recipe"],"name":"Spiced lentil &amp; butternut squash soup","recipeYield":"Serves 4-6","image":[{"@type":"ImageObject","url":"https://img.example/soup.jpg"}],
"recipeIngredient":["2 tbsp olive oil","1 onion, finely chopped","200g red lentils","1l vegetable stock"],
"recipeInstructions":[{"@type":"HowToStep","text":"<p>Heat the oil.</p>"},{"@type":"HowToStep","text":"Add the rest &amp; simmer."}],
"recipeCategory":"Soup","keywords":"healthy, vegan, batch cooking, freezable","description":"A warming soup."}]}</script>
<script type="application/ld+json">{ not json }</script></head></html>`;

describe('reading recipes from web pages', () => {
  it('finds the recipe in the page', () => {
    const w = webRecipeFrom(ldJsonBlocks(html), 'https://www.bbcgoodfood.com/recipes/soup?utm=1')!;
    expect(w).toMatchObject({
      title: 'Spiced lentil & butternut squash soup',
      servings: 4,
      image: 'https://img.example/soup.jpg',
      method: 'Heat the oil.\nAdd the rest & simmer.',
      site: 'bbcgoodfood.com',
      description: 'A warming soup.',
    });
    expect(w.ingredients).toHaveLength(4);
    expect(w.tags).toEqual(['Soup', 'healthy', 'vegan', 'batch cooking']);
  });
  it('handles sections and plain-string instructions, and pages with no recipe', () => {
    const w = webRecipeFrom([{ '@type': 'Recipe', name: 'X', recipeInstructions: [{ '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Stir.' }] }], recipeYield: 2 }], 'https://a.b/c')!;
    expect(w.method).toBe('Sauce:\nStir.');
    expect(w.servings).toBe(2);
    expect(webRecipeFrom([{ '@type': 'Recipe', name: 'Y', recipeInstructions: 'Line one\nLine two' }], 'u')!.method).toBe('Line one\nLine two');
    expect(webRecipeFrom([{ '@type': 'Article' }], 'u')).toBeNull();
  });
  it('makes one of our recipes, matching ingredients', () => {
    const r = webToRecipe(webRecipeFrom(ldJsonBlocks(html), 'https://www.bbcgoodfood.com/recipes/soup?utm=1')!, 'nuria', foods, 'nuria', () => 'id');
    expect(r).toMatchObject({ owner: 'nuria', servings: 4, importId: 'web:https://www.bbcgoodfood.com/recipes/soup', sourceUrl: 'https://www.bbcgoodfood.com/recipes/soup?utm=1' });
    expect(r.ingredients.filter((i) => i.foodId).length).toBe(4);
  });
  it('finds a link in shared text', () => {
    expect(findUrl('Lentil soup | BBC Good Food https://www.bbcgoodfood.com/recipes/x')).toBe('https://www.bbcgoodfood.com/recipes/x');
    expect(findUrl('no link')).toBeUndefined();
  });
});

describe('finding the recipe in awkward pages', () => {
  it('finds a recipe stored as a JSON string deep in page data, ignoring related recipes without ingredients', () => {
    const page = { props: { pageProps: { related: [{ '@type': 'Recipe', name: 'other' }], schema: JSON.stringify({ '@type': 'Recipe', name: 'Next soup', recipeIngredient: ['1 tbsp olive oil'] }) } } };
    expect(findRecipeNode([page])?.name).toBe('Next soup');
  });
  it('accepts full schema.org type URLs', () => {
    expect(findRecipeNode([{ '@type': 'http://schema.org/Recipe', name: 'X', recipeIngredient: ['1 egg'] }])?.name).toBe('X');
  });
  it('falls back to a recipe without ingredients if that is all there is', () => {
    expect(findRecipeNode([{ '@type': 'Recipe', name: 'Bare' }])?.name).toBe('Bare');
  });
});
