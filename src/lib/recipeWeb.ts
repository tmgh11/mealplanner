/**
 * Reading a recipe from a web page. Almost every recipe site describes its recipe for search
 * engines in a <script type="application/ld+json"> block (schema.org "Recipe"). A small Supabase
 * function fetches the page (a web app can't read other sites directly) and returns those blocks;
 * this turns them into a recipe.
 */
import { resolveLine } from './ingredients';
import { parseMinutes } from './times';
import type { Food, Person, Recipe, Who } from './types';

export interface WebRecipe {
  title: string;
  ingredients: string[];
  method: string;
  servings?: number;
  image?: string;
  tags: string[];
  prepMins?: number;
  cookMins?: number;
  totalMins?: number;
  url: string;
  site?: string;
  description?: string;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ')
    .trim();

type Node = Record<string, unknown>;
const isRecipe = (n: unknown): n is Node => {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return false;
  const t = (n as Node)['@type'];
  const is = (x: unknown) => typeof x === 'string' && /(^|[/:])Recipe$/i.test(x);
  return is(t) || (Array.isArray(t) && t.some(is));
};

/**
 * Find the Recipe in JSON-LD, which may be a list, sit in an @graph, or be nested deep inside a
 * site's own page data (sometimes as a JSON string). Searches breadth-first, so the page's main
 * recipe wins over "more recipes like this" further down.
 */
export function findRecipeNode(blocks: unknown[]): Node | null {
  const queue: unknown[] = [...blocks];
  let seen = 0;
  let first: Node | null = null;
  while (queue.length && seen++ < 50000) {
    let n = queue.shift();
    if (typeof n === 'string') {
      if (n.length < 50 || !n.includes('Recipe') || !/^\s*[[{]/.test(n)) continue;
      try {
        n = JSON.parse(n);
      } catch {
        continue;
      }
    }
    if (isRecipe(n)) {
      if ((n as Node).recipeIngredient || (n as Node).ingredients) return n as Node;
      first ??= n as Node;
    }
    if (Array.isArray(n)) queue.push(...n);
    else if (n && typeof n === 'object') queue.push(...Object.values(n as Node));
  }
  return first;
}

const text = (v: unknown): string => (typeof v === 'string' ? decode(v) : typeof v === 'number' ? String(v) : '');

function steps(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') {
    for (const line of decode(v).split(/\n+/)) if (line.trim()) out.push(line.trim());
  } else if (Array.isArray(v)) v.forEach((x) => steps(x, out));
  else if (v && typeof v === 'object') {
    const o = v as Node;
    if (o['@type'] === 'HowToSection') {
      if (o.name) out.push(`${text(o.name)}:`);
      steps(o.itemListElement, out);
    } else if (o.text) out.push(text(o.text));
    else if (o.name) out.push(text(o.name));
  }
  return out;
}

const firstImage = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (v && typeof v === 'object') return text((v as Node).url) || undefined;
  return undefined;
};

/** "Serves 4", ["4", "4 servings"], 6 → 4 / 6 */
const servingsOf = (v: unknown): number | undefined => {
  const s = Array.isArray(v) ? v.map(text).join(' ') : text(v);
  const m = s.match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return n > 0 && n < 100 ? n : undefined;
};

export function webRecipeFrom(blocks: unknown[], url: string): WebRecipe | null {
  const r = findRecipeNode(blocks);
  if (!r) return null;
  const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : []).map(text).filter(Boolean);
  const keywords = typeof r.keywords === 'string' ? r.keywords.split(',') : Array.isArray(r.keywords) ? r.keywords.map(text) : [];
  const cats = [r.recipeCategory, r.recipeCuisine].flatMap((c) => (Array.isArray(c) ? c.map(text) : c ? [text(c)] : []));
  let site: string | undefined;
  try {
    site = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    site = undefined;
  }
  return {
    title: text(r.name) || 'Untitled recipe',
    ingredients,
    method: steps(r.recipeInstructions).join('\n'),
    servings: servingsOf(r.recipeYield),
    prepMins: parseMinutes(text(r.prepTime)),
    cookMins: parseMinutes(text(r.cookTime)),
    totalMins: parseMinutes(text(r.totalTime)),
    image: firstImage(r.image),
    tags: [...new Set([...cats, ...keywords.slice(0, 3)].map((t) => t.trim()).filter((t) => t && t.length < 30))].slice(0, 5),
    url,
    site,
    description: text(r.description) || undefined,
  };
}

/** Pull the JSON-LD blocks out of a page's HTML. Bad JSON is skipped. */
export function ldJsonBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* some sites put two objects in one block, or comments: skip */
    }
  }
  return out;
}

export function webToRecipe(w: WebRecipe, owner: Who, foods: Food[], me: Person, newId: () => string): Recipe {
  return {
    id: newId(),
    kind: 'recipe',
    title: w.title,
    owner,
    servings: w.servings ?? 4,
    prepMins: w.prepMins,
    cookMins: w.cookMins,
    totalMins: w.totalMins,
    ingredients: w.ingredients.map((l) => resolveLine(l, foods).ingredient),
    method: w.method,
    notes: w.description,
    sourceUrl: w.url,
    tags: w.tags,
    photo: w.image,
    importId: `web:${w.url.replace(/[?#].*$/, '')}`,
    createdBy: me,
    updatedAt: 0,
  };
}

/** A link in shared text ("Lentil soup | BBC Good Food https://…"). */
export const findUrl = (s: string) => s.match(/https?:\/\/[^\s<>"']+/)?.[0];
