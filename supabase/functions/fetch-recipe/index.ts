// Meal Planner: fetch a recipe page and return its recipe data.
//
// A web app can't read other websites from the browser, so the Browser screen asks this
// function instead. It fetches the page and returns the schema.org JSON-LD blocks that recipe
// sites publish for search engines (the app turns them into a recipe). Only signed-in users can
// call it (Supabase checks their login before this code runs).
//
// Set up once: Supabase dashboard → Edge Functions → Deploy a new function → Via Editor,
// name it fetch-recipe, paste this whole file in, and press Deploy.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Only ordinary public websites (not this server's own network). */
function allowed(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]') return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  return h.includes('.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body.url ?? '').trim());
  } catch {
    return json({ error: 'That isn’t a web address' }, 400);
  }
  if (!allowed(url)) return json({ error: 'That address can’t be fetched' }, 400);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MealPlanner/1.0; personal recipe saver)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
  } catch (e) {
    return json({ error: `Couldn’t reach that site (${e instanceof Error ? e.message : 'network error'})` }, 502);
  }
  if (!res.ok) return json({ error: `The site said ${res.status}`, status: res.status }, 502);

  // read at most 5 MB
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5_000_000) break;
    chunks.push(value);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  const html = new TextDecoder().decode(bytes);

  const blocks: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // skip bad blocks
    }
  }
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1];

  return json({
    url: res.url || url.href,
    blocks,
    title: meta('og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
    image: meta('og:image'),
  });
});
