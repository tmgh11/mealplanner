import { methodSteps } from './method';
import { fmtMinutes, totalMinutes } from './times';
import type { Recipe } from './types';

/** WhatsApp reads *stars* as bold and _underscores_ as italics, so take them out of the text itself. */
const plain = (s: string) => s.replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim();

/**
 * A recipe as a message to paste into WhatsApp: the title in bold, a line of servings and times,
 * the ingredients as bullets, the method numbered, then any notes and the link it came from.
 */
export function recipeAsText(r: Recipe): string {
  const out: string[] = [`*${plain(r.title) || 'Recipe'}*`];

  const facts = [`Serves ${r.servings}`];
  if (r.prepMins) facts.push(`Prep ${fmtMinutes(r.prepMins)}`);
  if (r.cookMins) facts.push(`Cook ${fmtMinutes(r.cookMins)}`);
  if (!r.prepMins && !r.cookMins && totalMinutes(r)) facts.push(fmtMinutes(totalMinutes(r)));
  out.push(facts.join(' · '));

  const ingredients = r.ingredients.filter((i) => i.text.trim());
  if (ingredients.length) {
    out.push('', '*Ingredients*');
    ingredients.forEach((i, n) => {
      if (i.heading) out.push(...(n ? [''] : []), `_${plain(i.text).replace(/:$/, '')}_`);
      else out.push(`• ${plain(i.text)}`);
    });
  }

  const steps = methodSteps(r.method);
  if (steps.length) {
    out.push('', '*Method*');
    steps.forEach((s, n) => {
      if (s.heading) out.push(...(n ? [''] : []), `_${plain(s.text).replace(/:$/, '')}_`);
      else out.push(`${s.n}. ${plain(s.text)}`);
    });
  }

  if (r.notes?.trim()) out.push('', '*Notes*', ...r.notes.trim().split(/\n+/).map((l) => l.replace(/[*_~]/g, '').trim()));
  if (r.sourceUrl) out.push('', r.sourceUrl);
  return out.join('\n');
}
