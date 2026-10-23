import { useEffect, useMemo, useState } from 'react';
import { Icon, Seg, Sheet } from './ui';
import { WhoSwitch, WhoTag, useView } from './WhoSwitch';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import { useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { perServing, recipeTotals, fmtKcal } from '../lib/nutrition';
import { visibleIn, type Recipe } from '../lib/types';
import { fmtMinutes, totalMinutes } from '../lib/times';

/** Does the person on this phone want to see nutrition? */
export function useTracking() {
  const { settings, device } = useStore();
  return settings.tracking[device.me]?.on ?? false;
}

export function RecipesView({ incoming, onIncomingUsed }: { incoming?: string; onIncomingUsed?: () => void } = {}) {
  const { recipes } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [q, setQ] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [time, setTime] = useState<TimeFilter>('any');
  const [tagsOn, setTagsOn] = useState<string[]>([]);
  const filterCount = tagsOn.length + (time === 'any' ? 0 : 1);
  const [viewing, setViewing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ link?: string } | null>(null);
  // a recipe link shared into the app: start a new recipe and read it
  useEffect(() => {
    if (incoming) {
      setAdding({ link: incoming });
      onIncomingUsed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const mine = useMemo(() => recipes.filter((r) => visibleIn(r.owner, view)), [recipes, view]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return mine.filter(
      (r) =>
        passes(r, time, tagsOn) &&
        words.every((w) => r.title.toLowerCase().includes(w) || r.tags.some((t) => t.toLowerCase().includes(w)) || r.ingredients.some((i) => i.text.toLowerCase().includes(w))),
    );
  }, [mine, q, time, tagsOn]);

  return (
    <>
      <WhoSwitch />
      <div className="search-row">
        <label className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" />
        </label>
        <button className={`filter-btn${filterCount ? ' on' : ''}`} onClick={() => setFiltering(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ''}`}>
          <Icon name="filter" size={20} />
          {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
        </button>
      </div>
      {filterCount > 0 && (
        <div className="active-filters">
          {time !== 'any' && (
            <button className="chip on" onClick={() => setTime('any')}>
              {TIME_LABELS[time]} <Icon name="close" size={12} />
            </button>
          )}
          {tagsOn.map((t) => (
            <button key={t} className="chip on" onClick={() => setTagsOn(tagsOn.filter((x) => x !== t))}>
              {t} <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="book" size={26} /></div>
          {recipes.length === 0 ? (
            <>
              <p style={{ margin: '0 0 4px', fontWeight: 650, color: 'var(--text)' }}>No recipes yet</p>
              <p style={{ margin: 0 }}>Add one and paste in its ingredients. Weights are matched to UK food data automatically.</p>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              Nothing matches{view !== 'both' ? ' in this view' : ''}.
              {filterCount > 0 && (
                <>
                  {' '}
                  <button className="link-btn small" onClick={() => { setTime('any'); setTagsOn([]); }}>Clear filters</button>
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="card list">
          {shown.map((r) => {
            const t = foods.ready ? recipeTotals(r.ingredients, foods.get) : null;
            const kcal = t ? perServing(r, t).kcal : null;
            return (
              <button key={r.id} className="row" onClick={() => setViewing(r.id)}>
                {r.photo ? <img className="thumb" src={r.photo} alt="" loading="lazy" /> : <span className="thumb thumb-empty"><Icon name="book" size={18} /></span>}
                <span className="row-main">
                  <span className="row-title">{r.title || 'Untitled recipe'}</span>
                  <span className="row-sub">
                    {[totalMinutes(r) && fmtMinutes(totalMinutes(r)), `serves ${r.servings}`].filter(Boolean).join(' · ')}
                    {r.tags.length ? ` · ${r.tags.join(', ')}` : ''}
                  </span>
                </span>
                <span className="row-amt">
                  <WhoTag who={r.owner} />
                  {tracking && kcal != null && kcal > 0 && <span className="eff text-2" style={{ display: 'block', marginTop: 4 }}>{fmtKcal(kcal)} kcal</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}


      <div className="home-actions">
        <button className="btn primary add" onClick={() => setAdding({})}>
          <Icon name="plus" size={22} stroke={2.4} /> Add recipe
        </button>
      </div>

      {filtering && (
        <FilterSheet recipes={mine} time={time} setTime={setTime} tagsOn={tagsOn} setTagsOn={setTagsOn} count={shown.length} onClose={() => setFiltering(false)} />
      )}
      {viewing && <RecipeView id={viewing} onClose={() => setViewing(null)} />}
      {adding && (
        <RecipeEditor
          link={adding.link}
          onClose={() => setAdding(null)}
          onOpenOther={(r) => {
            setAdding(null);
            setViewing(r.id);
          }}
        />
      )}
    </>
  );
}

type TimeFilter = 'any' | '30' | '60' | 'long';
const TIME_LABELS: Record<TimeFilter, string> = { any: 'Any time', '30': 'Up to 30 min', '60': 'Up to 1 hr', long: 'Over 1 hr' };

/** Does a recipe pass the filters? Every chosen tag must be on it; a time filter skips recipes with no time. */
function passes(r: Recipe, time: TimeFilter, tags: string[]): boolean {
  if (tags.length && !tags.every((t) => r.tags.some((x) => x.toLowerCase() === t.toLowerCase()))) return false;
  if (time === 'any') return true;
  const m = totalMinutes(r);
  if (!m) return false;
  return time === '30' ? m <= 30 : time === '60' ? m <= 60 : m > 60;
}

function FilterSheet({
  recipes,
  time,
  setTime,
  tagsOn,
  setTagsOn,
  count,
  onClose,
}: {
  recipes: Recipe[];
  time: TimeFilter;
  setTime: (t: TimeFilter) => void;
  tagsOn: string[];
  setTagsOn: (t: string[]) => void;
  count: number;
  onClose: () => void;
}) {
  // every tag in use, most used first ("Dinner" and "dinner" count as one)
  const tags = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const r of recipes)
      for (const t of r.tags) {
        const k = t.toLowerCase();
        const e = m.get(k) ?? { name: t, n: 0 };
        e.n++;
        m.set(k, e);
      }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [recipes]);
  const timed = recipes.filter((r) => totalMinutes(r)).length;
  const toggle = (t: string) => setTagsOn(tagsOn.some((x) => x.toLowerCase() === t.toLowerCase()) ? tagsOn.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tagsOn, t]);

  return (
    <Sheet
      title="Filter recipes"
      onClose={onClose}
      headerAction={
        tagsOn.length || time !== 'any' ? (
          <button className="link-btn small" style={{ marginRight: 8 }} onClick={() => { setTime('any'); setTagsOn([]); }}>
            Clear
          </button>
        ) : undefined
      }
      footer={
        <button className="btn primary" onClick={onClose}>
          {count ? `Show ${count} recipe${count === 1 ? '' : 's'}` : 'No recipes match'}
        </button>
      }
    >
      <div className="field">
        <span className="field-label">How long it takes</span>
        <Seg<TimeFilter>
          value={time}
          onChange={setTime}
          options={(['any', '30', '60', 'long'] as TimeFilter[]).map((v) => ({ value: v, label: v === 'any' ? 'Any' : v === '30' ? '≤ 30 min' : v === '60' ? '≤ 1 hr' : '> 1 hr' }))}
        />
        <p className="small-print" style={{ margin: '6px 2px 0' }}>
          {timed} of {recipes.length} recipes have a time; the others are left out when you pick one.
        </p>
      </div>
      <div className="field">
        <span className="field-label">Tags</span>
        {tags.length ? (
          <div className="chip-wrap">
            {tags.map((t) => {
              const on = tagsOn.some((x) => x.toLowerCase() === t.name.toLowerCase());
              return (
                <button key={t.name} className={`chip${on ? ' on' : ''}`} onClick={() => toggle(t.name)} aria-pressed={on}>
                  {t.name} <span className="chip-n">{t.n}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="small-print">No tags yet. Add them when editing a recipe.</p>
        )}
        {tagsOn.length > 1 && <p className="small-print" style={{ margin: '8px 2px 0' }}>Showing recipes with all of these tags.</p>}
      </div>
    </Sheet>
  );
}
