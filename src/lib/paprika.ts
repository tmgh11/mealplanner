import { parseMinutes } from './times';
/**
 * Importing from Paprika. Paprika's "Export → All recipes" makes a .paprikarecipes file: a zip
 * with one .paprikarecipe per recipe, each of which is gzipped JSON. A single exported recipe is
 * just the gzipped JSON.
 */
import { gunzipSync, strFromU8, unzipSync } from 'fflate';
import { resolveLine } from './ingredients';
import { splitItems } from './parse';
import type { Food, Person, Recipe, Who } from './types';

export interface PaprikaRecipe {
  uid: string;
  name: string;
  ingredients?: string;
  directions?: string;
  notes?: string;
  description?: string;
  servings?: string;
  source?: string;
  source_url?: string;
  categories?: string[];
  rating?: number;
  photo_data?: string | null;
  prep_time?: string;
  cook_time?: string;
  total_time?: string;
}

const isGzip = (d: Uint8Array) => d[0] === 0x1f && d[1] === 0x8b;
const isZip = (d: Uint8Array) => d[0] === 0x50 && d[1] === 0x4b;

export function readPaprika(data: Uint8Array): PaprikaRecipe[] {
  const parse = (bytes: Uint8Array) => JSON.parse(strFromU8(isGzip(bytes) ? gunzipSync(bytes) : bytes)) as PaprikaRecipe;
  if (isZip(data)) {
    const files = unzipSync(data);
    return Object.entries(files)
      .filter(([name, bytes]) => !name.endsWith('/') && bytes.length)
      .map(([, bytes]) => parse(bytes))
      .filter((r) => r && r.name);
  }
  if (isGzip(data)) return [parse(data)];
  throw new Error('Not a Paprika export');
}

/** "Serves 4 easy" → 4, "Serves 4-6" → 4, "Cuts into 10 slices" → 10, "Serving: 1" → 1, "" → undefined. */
export function parseServings(text?: string): number | undefined {
  const m = (text ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100 ? n : undefined;
}

const clean = (s?: string) => (s ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

export function paprikaToRecipe(p: PaprikaRecipe, owner: Who, foods: Food[], me: Person, newId: () => string): Recipe {
  const lines = splitItems(clean(p.ingredients), false);
  const notes = [clean(p.description), clean(p.notes)].filter(Boolean).join('\n\n');
  const url = p.source_url?.trim() || (/^https?:\/\//.test(p.source ?? '') ? p.source!.trim() : '');
  return {
    id: newId(),
    kind: 'recipe',
    title: p.name.trim(),
    owner,
    servings: parseServings(p.servings) ?? 4,
    prepMins: parseMinutes(p.prep_time),
    cookMins: parseMinutes(p.cook_time),
    totalMins: parseMinutes(p.total_time),
    ingredients: lines.map((l) => resolveLine(l, foods).ingredient),
    method: clean(p.directions),
    notes: notes || undefined,
    sourceUrl: url || undefined,
    tags: [...new Set((p.categories ?? []).map((c) => c.trim()).filter(Boolean))],
    rating: p.rating || undefined,
    photo: p.photo_data ? `data:image/jpeg;base64,${p.photo_data}` : undefined,
    importId: `paprika:${p.uid}`,
    createdBy: me,
    updatedAt: 0,
  };
}
