import { useEffect, useMemo, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { WhoTag, useView } from './WhoSwitch';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { fetchWebRecipe, FetchProblem } from '../lib/fetchRecipe';
import { findUrl, webToRecipe, type WebRecipe } from '../lib/recipeWeb';
import type { Recipe, Who } from '../lib/types';

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * The Browser: paste (or share in) a recipe link and the app reads the recipe off the page.
 * A web app can't show other sites inside itself, so searching opens in the phone's browser;
 * share or copy the recipe's link back here.
 */
export function BrowserView({ incoming, onIncomingUsed }: { incoming?: string; onIncomingUsed: () => void }) {
  const { recipes } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FetchProblem | null>(null);
  const [found, setFound] = useState<WebRecipe | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

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

      {!busy && !problem && recent.length === 0 && (
        <p className="small-print browser-hint">Paste a link to any recipe page and the app reads the recipe in for you. Type words instead to search the web.</p>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-title">Recently saved</div>
          <div className="card list">
            {recent.map((r) => (
              <button key={r.id} className="row" onClick={() => setViewing(r.id)}>
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

      {found && <FoundSheet recipe={found} onClose={() => setFound(null)} onSaved={(r) => { setFound(null); setViewing(r.id); }} />}
      {viewing && <RecipeView id={viewing} onClose={() => setViewing(null)} />}
      {editing && <RecipeEditor draft={editing} onClose={() => setEditing(null)} />}
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
    toast('Saved to Recipes', { label: 'Open', run: () => onSaved(made) });
    onClose();
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
          {matched} of {lines.length} ingredients matched to UK food data{matched < lines.length ? '. You can pick foods for the rest any time from the recipe' : ''}.
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
