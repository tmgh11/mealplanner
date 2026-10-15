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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
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

  // Recipe data: the schema.org JSON-LD blocks first, then any other JSON the page carries
  // (some sites, built with Next.js and the like, keep it inside their page data instead).
  const blocks: unknown[] = [];
  const others: unknown[] = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const isLd = /type=["']?application\/ld\+json/i.test(attrs);
    const isJson = isLd || /type=["']?application\/json/i.test(attrs) || /id=["']__NEXT_DATA__/i.test(attrs);
    if (!isJson && !/"@type"\s*:\s*"Recipe"|\\"@type\\"\s*:\s*\\"Recipe\\"/.test(m[2])) continue;
    const parsed = isJson ? parseJson(m[2]) : objectsAround(m[2]);
    if (parsed === undefined) continue;
    (isLd ? blocks : others).push(parsed);
  }
  blocks.push(...others);

  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1];

  return json({
    url: res.url || url.href,
    blocks,
    // for working out why a page didn't give a recipe
    info: { status: res.status, bytes: html.length, scripts: blocks.length },
    title: meta('og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
    image: meta('og:image'),
  });
});

/** JSON.parse that forgives what sites get wrong: comments, CDATA, raw newlines and tabs in strings. */
function parseJson(raw: string): unknown {
  const t = raw.trim().replace(/^<!--|-->$/g, '').replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(t.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

/** For JSON written into a script (window.x = {...}): pull out the object around "@type":"Recipe". */
function objectsAround(src: string): unknown {
  const s = src.replace(/\\"/g, '"');
  const at = s.search(/"@type"\s*:\s*"Recipe"/);
  if (at < 0) return undefined;
  // walk back to each "{" before it and try to read a whole object from there
  for (let start = s.lastIndexOf('{', at), tries = 0; start >= 0 && tries < 40; start = s.lastIndexOf('{', start - 1), tries++) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const obj = parseJson(s.slice(start, i + 1));
        if (obj && typeof obj === 'object' && JSON.stringify(obj).includes('recipeIngredient')) return obj;
        break;
      }
    }
  }
  return undefined;
}
