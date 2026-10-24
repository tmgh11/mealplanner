import { describe, expect, it } from 'vitest';
import { methodSteps, moveExtrasToNotes, splitExtras } from './method';

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

describe('tips after the method go to the notes', () => {
  const cheesecake =
    'Heat the oven.\n\nBake for 30 mins.\n\nTips for how to make basque cheesecake\n\nBring the ingredients to room temperature\n\nCan you freeze basque cheesecake?\n\nIt can be frozen for up to a month';
  it('splits at a tips heading', () => {
    expect(splitExtras(cheesecake)).toEqual({
      method: 'Heat the oven.\n\nBake for 30 mins.',
      extras: 'Tips for how to make basque cheesecake\n\nBring the ingredients to room temperature\n\nCan you freeze basque cheesecake?\n\nIt can be frozen for up to a month',
    });
  });
  it('keeps the recipe’s own notes and adds the tips after them', () => {
    expect(moveExtrasToNotes({ method: cheesecake, notes: 'Prep: 10 min' })?.notes).toMatch(/^Prep: 10 min\n\nTips for how/);
    expect(moveExtrasToNotes({ method: 'Fry.\n\nServe.' })).toBeNull();
  });
  it('leaves ordinary steps alone, and works for one-step-per-line methods too', () => {
    expect(splitExtras('Fry the onion\nAdd tomatoes\nTop with cheese').extras).toBeUndefined();
    expect(splitExtras('Tip the flour into a bowl.\n\nMix.').extras).toBeUndefined();
    expect(splitExtras('Fry\n\nTip into a bowl\n\nServe').extras).toBeUndefined();
    expect(splitExtras('Fry\n\nTop tips:\n\nUse a hot pan').extras).toBe('Top tips:\n\nUse a hot pan');
    expect(splitExtras('Fry the onion\nServe\nStorage\nKeeps 3 days in the fridge').extras).toBe('Storage\nKeeps 3 days in the fridge');
  });
});
