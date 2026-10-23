import { describe, expect, it } from 'vitest';
import { fmtMinutes, parseMinutes, timesFromNotes, totalMinutes } from './times';
import type { Recipe } from './types';

describe('recipe times', () => {
  it.each([
    ['10 min', 10],
    ['1 hr', 60],
    ['3 hr 15 min', 195],
    ['1 hour, 50 minutes', 110],
    ['20 minutes to 25 minutes', 25],
    ['20-25 min', 25],
    ['PT1H30M', 90],
    ['PT40M', 40],
    ['P0DT0H20M', 20],
    ['45', 45],
    ['', undefined],
    ['soon', undefined],
  ])('%s → %s', (s, m) => expect(parseMinutes(s)).toBe(m));

  it('formats and totals', () => {
    expect(fmtMinutes(90)).toBe('1 hr 30 min');
    expect(fmtMinutes(45)).toBe('45 min');
    expect(totalMinutes({ prepMins: 10, cookMins: 30 })).toBe(40);
    expect(totalMinutes({ totalMins: 240 })).toBe(240);
    expect(totalMinutes({})).toBeUndefined();
  });

  it('moves times out of older imports’ notes', () => {
    const r = { notes: 'Lovely with rice.\n\nPrep: 10 min · Cook: 1 hr 30 min' } as Recipe;
    expect(timesFromNotes(r)).toMatchObject({ prepMins: 10, cookMins: 90, totalMins: undefined, notes: 'Lovely with rice.' });
    expect(timesFromNotes({ notes: 'Total: 4 hr' } as Recipe)).toMatchObject({ totalMins: 240, notes: undefined });
    // a note of their own that happens to start "Cook:" is left alone
    expect(timesFromNotes({ notes: 'Cook: until golden, then rest' } as Recipe)).toBeNull();
    expect(timesFromNotes({ notes: 'Just a note' } as Recipe)).toBeNull();
  });
});
