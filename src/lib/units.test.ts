import { describe, expect, it } from 'vitest';
import { methodToMetric, toMetric } from './units';

describe('toMetric', () => {
  it.each([
    ['3/4 cup orange juice', '180ml orange juice'],
    ['1 cup chicken stock', '240ml chicken stock'],
    ['1 1/2 lbs pork shoulder, skinless and boneless', '680g pork shoulder, skinless and boneless'],
    ['1 lb ground beef', '455g ground beef'],
    ['2 cups all-purpose flour', '250g all-purpose flour'],
    ['1/2 cup granulated sugar', '100g granulated sugar'],
    ['1 stick unsalted butter, softened', '115g unsalted butter, softened'],
    ['1 cup chopped parsley', '240ml chopped parsley'],
    ['8 oz cream cheese', '225g cream cheese'],
    ['1 (14.5 oz) can diced tomatoes', '1 (410g) can diced tomatoes'],
    ['4 fl oz milk', '120ml milk'],
    ['2 cups (480ml) water', '480ml water'],
    ['500g (1 lb) pork mince', '500g pork mince'],
    ['1-2 cups rice', '185–370g rice'],
    ['1½ cups basmati rice', '280g basmati rice'],
    ['2 tbsp olive oil', '2 tbsp olive oil'],
    ['1 cup rice vinegar', '240ml rice vinegar'],
    ['3 lbs boneless pork shoulder', '1.35kg boneless pork shoulder'],
  ])('%s → %s', (a, b) => expect(toMetric(a)).toBe(b));
});

describe('methodToMetric', () => {
  it('converts oven temperatures', () => {
    expect(methodToMetric('Preheat the oven to 350°F.')).toBe('Preheat the oven to 180°C (fan 160°C).');
    expect(methodToMetric('Bake at 425 degrees F for 20 minutes')).toBe('Bake at 220°C (fan 200°C) for 20 minutes');
    expect(methodToMetric('Heat to 180°C')).toBe('Heat to 180°C');
  });
});
