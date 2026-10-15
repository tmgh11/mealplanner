/** Ask our Supabase function for a web page's recipe data (see supabase/functions/fetch-recipe). */
import { getClient } from './sync';
import { webRecipeFrom, type WebRecipe } from './recipeWeb';

export class FetchProblem extends Error {
  constructor(
    message: string,
    /** what kind of problem, so the screen can say what to do */
    readonly kind: 'not-set-up' | 'signed-out' | 'no-recipe' | 'site' | 'offline',
  ) {
    super(message);
  }
}

export async function fetchWebRecipe(url: string): Promise<WebRecipe> {
  const sb = getClient();
  if (!sb) throw new FetchProblem('Connect to Supabase in Settings first.', 'not-set-up');
  const { data: session } = await sb.auth.getSession();
  if (!session.session) throw new FetchProblem('Sign in under Settings → Sync between phones to read recipes from websites.', 'signed-out');
  if (!navigator.onLine) throw new FetchProblem('You’re offline.', 'offline');

  const { data, error } = await sb.functions.invoke('fetch-recipe', { body: { url } });
  if (error) {
    const res = (error as { context?: Response }).context;
    let body: { error?: string; message?: string; code?: string } = {};
    try {
      body = res ? await res.clone().json() : {};
    } catch {
      /* not JSON */
    }
    if (res?.status === 404 && (body.code === 'NOT_FOUND' || /not found/i.test(body.message ?? ''))) {
      throw new FetchProblem('The recipe reader isn’t set up in Supabase yet.', 'not-set-up');
    }
    if (res?.status === 401) throw new FetchProblem('Sign in again under Settings to read recipes from websites.', 'signed-out');
    throw new FetchProblem(body.error ?? error.message ?? 'Couldn’t read that page.', 'site');
  }
  const d = data as { url: string; blocks: unknown[]; title?: string; image?: string; info?: { bytes: number; scripts: number } };
  const recipe = webRecipeFrom(d.blocks ?? [], d.url ?? url);
  if (!recipe) {
    const what = d.info ? ` [${Math.round(d.info.bytes / 1000)} KB, ${d.info.scripts} data blocks]` : '';
    throw new FetchProblem(`No recipe found on that page${d.title ? ` (“${d.title}”)` : ''}.${what}`, 'no-recipe');
  }
  if (!recipe.image && d.image) recipe.image = d.image;
  return recipe;
}
