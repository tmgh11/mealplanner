import { describe, expect, it } from 'vitest';
import { methodSteps } from './method';

const burger =
  'Peel and slice potatoes. Soak in cold water.\n\nIf air fryer:\n500g thin: ½-3 tbsp oil; 200c; 18-22 minutes\n500g thick: ½-3 tbsp oil; 200c; 20-22 minutes\n\nSlice the red onion\n\nToast the buns\n';

describe('method steps', () => {
  it('with blank lines: each block is one step, keeping its line breaks', () => {
    const s = methodSteps(burger);
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4]);
    expect(s[1].heading).toBeUndefined();
    expect(s[1].text).toBe('If air fryer:\n500g thin: ½-3 tbsp oil; 200c; 18-22 minutes\n500g thick: ½-3 tbsp oil; 200c; 20-22 minutes');
  });
  it('without blank lines: one step per line, and "Name:" lines are headings (website sections)', () => {
    const s = methodSteps('For the sauce:\nFry the onion\nAdd tomatoes\nFor the pasta:\nBoil it');
    expect(s).toEqual([
      { text: 'For the sauce', heading: true },
      { text: 'Fry the onion', n: 1 },
      { text: 'Add tomatoes', n: 2 },
      { text: 'For the pasta', heading: true },
      { text: 'Boil it', n: 3 },
    ]);
  });
  it('a colon line standing alone between blank lines is a heading; _underscores_ always are', () => {
    const s = methodSteps('_The sauce_\nFry the onion\n\nFor the pasta:\n\nBoil it\n\n1. Drain it');
    expect(s).toEqual([
      { text: 'The sauce', heading: true },
      { text: 'Fry the onion', n: 1 },
      { text: 'For the pasta', heading: true },
      { text: 'Boil it', n: 2 },
      { text: 'Drain it', n: 3 },
    ]);
  });
});
