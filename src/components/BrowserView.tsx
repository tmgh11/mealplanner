import { useEffect, useMemo, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { WhoTag, useView } from './WhoSwitch';
import { RecipeEditor } from './RecipeEditor';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { fetchWebRecipe, FetchProblem } from '../lib/fetchRecipe';
import { findUrl, webToRecipe, type WebRecipe } from '../lib/recipeWeb';
import type { Recipe, Who } from '../lib/types';

const DEFAULT_SITES = [
  { name: 'BBC Good Food', url: 'https://www.bbcgoodfood.com' },
  { name: 'Eatwell101', url: 'https://www.eatwell101.com' },
];

/** friendly names for sites recipes often come from */
const KNOWN: Record<string, string> = {
  'bbcgoodfood.com': 'BBC Good Food',
  'bbc.co.uk': 'BBC Food',
  'olivemagazine.com': 'Olive Magazine',
  'thekitchn.com': 'The Kitchn',
  'seriouseats.com': 'Serious Eats',
  'bonappetit.com': 'Bon Appétit',
  'jamieoliver.com': 'Jamie Oliver',
  'deliciousmagazine.co.uk': 'Delicious',
  'theguardian.com': 'The Guardian',
  'nytimes.com': 'NYT Cooking',
  'cooking.nytimes.com': 'NYT Cooking',
  'allrecipes.com': 'Allrecipes',
  'budgetbytes.com': 'Budget Bytes',
  'recipetineats.com': 'RecipeTin Eats',
  'lincolnshirelife.co.uk': 'Lincolnshire Life',
  'pinchofyum.com': 'Pinch of Yum',
  'minimalistbaker.com': 'Minimalist Baker',
  'loveandlemons.com': 'Love and Lemons',
  'sainsburysmagazine.co.uk': 'Sainsbury’s Magazine',
  'tesco.com': 'Tesco Real Food',
  'realfood.tesco.com': 'Tesco Real Food',
  'eatwell101.com': 'Eatwell101',
  'sunglowkitchen.com': 'Sunglow Kitchen',
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const siteName = (h: string) => KNOWN[h] ?? h.replace(/\.(co\.uk|com|net|org|co|uk)$/, '').replace(/[-.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The Browser: paste (or share in) a recipe link and the app reads the recipe off the page.
 * A web app can't show other sites inside itself, so searching and favourite sites open in the
 * phone's browser; share or copy the recipe's link back here.
 */
export function BrowserView({ incoming, onIncomingUsed }: { incoming?: string; onIncomingUsed: () => void }) {
  const { recipes } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FetchProblem | null>(null);
  const [found, setFound] = useState<WebRecipe | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const read = async (raw: string) => {
    const url = findUrl(raw);
    if (!url) {
      // words, not a link: search the web for recipes
      window.open(`https://www.google.com/search?q=${encodeURIComponent(`${raw} recipe`)}`, '_blank', 'noopener');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      setFound(await fetchWebRecipe(url));
      setText('');
    } catch (e) {
      setProblem(e instanceof FetchProblem ? e : new FetchProblem(e instanceof Error ? e.message : 'Couldn’t read that page.', 'site'));
      setText(url);
    } finally {
      setBusy(false);
    }
  };

  // a link shared into the app from another app (Android), or handed over by the URL
  useEffect(() => {
    if (incoming) {
      setText(incoming);
      void read(incoming);
      onIncomingUsed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  // favourite sites: the ones your recipes come from most, plus a couple of good UK ones
  const sites = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      const h = r.sourceUrl && host(r.sourceUrl);
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    const yours = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => ({ name: siteName(h), url: `https://${h}` }));
    const all = [...yours, ...DEFAULT_SITES];
    return all.filter((s, i) => all.findIndex((x) => host(x.url) === host(s.url)) === i).slice(0, 8);
  }, [recipes]);

  const recent = recipes.filter((r) => r.importId?.startsWith('web:')).slice(-4).reverse();
  const isUrl = Boolean(findUrl(text));

  return (
    <>
      <form
        className="search browser-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void read(text.trim());
        }}
      >
        <Icon name={isUrl ? 'link' : 'search'} size={18} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a recipe link, or search"
          aria-label="Recipe link or search"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
        />
        {text.trim() && (
          <button className="btn small primary" type="submit" disabled={busy}>
            {busy ? 'Reading…' : isUrl ? 'Get recipe' : 'Search'}
          </button>
        )}
      </form>

      {busy && <div className="note">Reading the recipe from the page…</div>}
      {problem && <ProblemNote problem={problem} onBlank={() => setEditing(blankFromUrl(text))} />}

      <div className="section-title">Sites</div>
      <div className="site-grid">
        {sites.map((s) => (
          <a key={s.url} className="site-chip" href={s.url} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={16} />
            <span>{s.name}</span>
          </a>
        ))}
      </div>

      <div className="section-title">How to save a recipe you find</div>
      <div className="card pad how">
        <p><strong>Android:</strong> on the recipe page in Chrome, tap <strong>Share</strong> and choose <strong>Meal Planner</strong>.</p>
        <p><strong>iPhone:</strong> tap <strong>Share → Copy</strong>, then paste the link in the box above.</p>
        <p className="muted">The app reads the recipe from the page and matches its ingredients to the UK food data. You can check everything before it’s saved.</p>
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title">Recently saved</div>
          <div className="card list">
            {recent.map((r) => (
              <button key={r.id} className="row" onClick={() => setEditing(r)}>
                {r.photo && <img className="thumb" src={r.photo} alt="" />}
                <span className="row-main">
                  <span className="row-title">{r.title}</span>
                  <span className="row-sub">{host(r.sourceUrl ?? '')}</span>
                </span>
                <span className="row-amt"><WhoTag who={r.owner} /></span>
              </button>
            ))}
          </div>
        </>
      )}

      {found && <FoundSheet recipe={found} onClose={() => setFound(null)} onSaved={(r) => { setFound(null); setEditing(r); }} />}
      {editing && <RecipeEditor initial={recipes.some((r) => r.id === editing.id) ? editing : undefined} draft={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function blankFromUrl(url: string): Recipe {
  return { id: newId(), kind: 'recipe', title: '', owner: 'both', servings: 4, ingredients: [], method: '', tags: [], sourceUrl: findUrl(url), updatedAt: 0 };
}

function ProblemNote({ problem, onBlank }: { problem: FetchProblem; onBlank: () => void }) {
  return (
    <div className="note problem">
      <Icon name="alert" size={20} />
      <span>
        {problem.message}
        {problem.kind === 'not-set-up' && <> See “Recipe reader” in the README: it’s a one-off, 2-minute step in Supabase.</>}
        {(problem.kind === 'no-recipe' || problem.kind === 'site') && (
          <>
            {' '}
            <button className="link-btn small" onClick={onBlank}>Type it in instead</button>
          </>
        )}
      </span>
    </div>
  );
}

/** What was read from the page, before saving. */
function FoundSheet({ recipe, onClose, onSaved }: { recipe: WebRecipe; onClose: () => void; onSaved: (r: Recipe) => void }) {
  const { settings, recipes, device } = useStore();
  const view = useView();
  const foods = useFoods();
  const [who, setWho] = useState<Who>(view);
  const made = useMemo(() => (foods.ready ? webToRecipe(recipe, who, foods.foods, device.me, newId) : null), [recipe, who, foods, device.me]);
  const already = recipes.find((r) => made && r.importId === made.importId);
  const lines = made?.ingredients.filter((i) => !i.heading) ?? [];
  const matched = lines.filter((i) => i.foodId !== undefined).length;

  const save = () => {
    if (!made) return;
    store.put(made);
    toast('Saved to Recipes');
    onSaved(made);
  };

  return (
    <Sheet
      title="Save this recipe?"
      onClose={onClose}
      full
      footer={
        already ? (
          <button className="btn primary" onClick={() => onSaved(already)}>Already saved: open it</button>
        ) : (
          <button className="btn primary save" disabled={!made} onClick={save}>
            <span>Save to Recipes</span>
            <span className="save-sub">You can check the ingredients next</span>
          </button>
        )
      }
    >
      {recipe.image && <img className="hero" src={recipe.image} alt="" />}
      <h3 className="found-title">{recipe.title}</h3>
      <p className="small-print" style={{ marginTop: -4 }}>
        {[recipe.site, recipe.servings ? `serves ${recipe.servings}` : '', `${recipe.ingredients.length} ingredients`].filter(Boolean).join(' · ')}
      </p>
      <div className="field">
        <span className="field-label">Whose recipe</span>
        <Seg<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: 'tom', label: settings.names.tom, className: 'tom' },
            { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>
      {made && (
        <div className="note">
          {matched} of {lines.length} ingredients matched to UK food data{matched < lines.length ? '; the rest you can pick after saving' : ''}.
        </div>
      )}
      <div className="section-title">Ingredients</div>
      <ul className="plain-list">
        {recipe.ingredients.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {recipe.method && (
        <>
          <div className="section-title">Method</div>
          <ol className="plain-list">
            {recipe.method.split('\n').slice(0, 30).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </>
      )}
    </Sheet>
  );
}
