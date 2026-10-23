/** Recipe times: reading "1 hr 30 min", "PT1H30M", "20 minutes to 25 minutes"; showing them. */
import type { Recipe } from './types';

/** Minutes from how recipes write a time. A range counts as its longer end. Undefined if none. */
export function parseMinutes(s?: string | null): number | undefined {
  if (!s) return undefined;
  const t = String(s).trim();
  // schema.org: PT1H30M, P0DT0H40M
  const iso = t.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (iso && /\d/.test(t)) {
    const m = Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
    return m > 0 ? Math.round(m) : undefined;
  }
  // a range: use the later part ("20 minutes to 25 minutes", "20-25 min")
  const parts = t.toLowerCase().split(/\s+to\s+|\s*[–-]\s*(?=\d)/);
  const part = parts[parts.length - 1];
  let mins = 0;
  let found = false;
  for (const m of part.matchAll(/(\d+(?:[.,]\d+)?)\s*(h(?:ou)?rs?|h\b|m(?:in(?:ute)?s?)?\b)?/g)) {
    const n = Number(m[1].replace(',', '.'));
    const unit = m[2] ?? '';
    if (/^h/.test(unit)) mins += n * 60;
    else if (/^m/.test(unit)) mins += n;
    else if (!found && parts.length > 1) continue;
    else mins += n; // a bare number: minutes
    found = true;
  }
  if (!found && parts.length > 1) return parseMinutes(parts[0]);
  return found && mins > 0 ? Math.round(mins) : undefined;
}

/** "45 min", "1 hr", "1 hr 30 min" */
export function fmtMinutes(m?: number): string {
  if (!m) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} hr${r ? ` ${r} min` : ''}` : `${r} min`;
}

/** The whole time a recipe takes: its total, or prep + cook. */
export const totalMinutes = (r: Pick<Recipe, 'prepMins' | 'cookMins' | 'totalMins'>) =>
  r.totalMins ?? (r.prepMins || r.cookMins ? (r.prepMins ?? 0) + (r.cookMins ?? 0) : undefined);

/**
 * Older imports put the times in the notes as "Prep: 10 min · Cook: 30 min · Total: 40 min".
 * Moves them into the recipe's own time fields. Returns null if there's nothing to move.
 */
export function timesFromNotes(r: Recipe): Recipe | null {
  if (!r.notes || r.prepMins || r.cookMins || r.totalMins) return null;
  const lines = r.notes.split('\n');
  const i = lines.findIndex((l) => /^(prep|cook|total): /i.test(l.trim()) && l.split(' · ').every((p) => /^(prep|cook|total): .+/i.test(p.trim()) && parseMinutes(p.trim().replace(/^\w+: /, '')) != null));
  if (i < 0) return null;
  const got: Partial<Record<'prep' | 'cook' | 'total', number>> = {};
  for (const p of lines[i].split(' · ')) {
    const [, k, v] = p.trim().match(/^(prep|cook|total): (.+)$/i)!;
    got[k.toLowerCase() as 'prep'] = parseMinutes(v);
  }
  lines.splice(i, 1);
  const notes = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { ...r, prepMins: got.prep, cookMins: got.cook, totalMins: got.total, notes: notes || undefined };
}
