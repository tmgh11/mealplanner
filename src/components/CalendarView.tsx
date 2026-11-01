import { useMemo, useState, type ReactNode } from 'react';
import { HoldButton, Icon, Seg, toast } from './ui';
import { useView } from './WhoSwitch';
import { MealChip } from './MealChip';
import { DateStrip, Swipeable, dayDiff } from './CalendarNav';
import { MealEditor } from './MealEditor';
import { useTracking } from './RecipesView';
import { AddMenuSheet, SaveAsMenuSheet } from './MenuSheets';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { addDays, fromISO, today } from '../lib/dates';
import { dayLabel, dayTotal, daysFrom, mealTitle, peopleOf, rangeLabel, weekStart } from '../lib/plan';
import { fmtKcal } from '../lib/nutrition';
import { SLOT_LABELS, SLOTS, visibleIn, type Meal, type MealBody, type Person, type Recipe, type Slot, type Who } from '../lib/types';

const weekday = (d: string) => fromISO(d).toLocaleDateString('en-GB', { weekday: 'short' }).replace(/[.,]/g, '');

type Editing = { meal?: Meal; body: MealBody; date: string } | null;

export function CalendarView() {
  const { mealsByDate, recipes, settings, device } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const t = today();
  const mode = device.calMode ?? 'day';
  const [selected, setSelectedRaw] = useState(t);
  // which way the last move went, so the new day slides in from the right side
  const [dir, setDir] = useState<'next' | 'prev' | null>(null);
  const setSelected = (d: string) => {
    if (d === selected) return;
    setDir(d > selected ? 'next' : 'prev');
    setSelectedRaw(d);
  };
  const start = weekStart(selected);
  const [editing, setEditing] = useState<Editing>(null);
  const [sheet, setSheet] = useState<'add-menu' | 'save-menu' | null>(null);
  const [showPast, setShowPast] = useState(false);

  const days = daysFrom(start, 7);
  const lookup = useMemo(() => ({ recipe: (id: string) => recipes.find((r) => r.id === id), food: foods.get }), [recipes, foods]);
  const shownPeople: Person[] = peopleOf(view);
  const totalsFor = tracking ? shownPeople.filter((p) => settings.tracking[p].on) : [];
  const mealsOn = (date: string) => (mealsByDate.get(date) ?? []).filter((m) => visibleIn(m.who, view));

  /** New meal: in the slot asked for, or the first one not yet planned that day. */
  const add = (date: string, slot?: Slot) => {
    const taken = mealsOn(date).map((m) => m.slot);
    const s = slot ?? SLOTS.find((x) => !taken.includes(x)) ?? 'dinner';
    // most meals are just for one of you: start with whoever's phone this is (or the person being viewed)
    const who: Who = view === 'both' ? device.me : view;
    setEditing({ date, body: { slot: s, who, content: { type: 'note', text: '' } } });
  };

  const saveMeal = (body: MealBody, date?: string) => {
    const d = date ?? editing!.date;
    if (editing?.meal) {
      store.put({ ...editing.meal, ...body, date: d });
      toast('Meal saved');
    } else {
      const order = (mealsByDate.get(d) ?? []).reduce((m, x) => Math.max(m, x.order), -1) + 1;
      store.put({ ...body, id: newId(), kind: 'meal', date: d, order, createdBy: device.me, updatedAt: 0 });
      toast('Meal added');
    }
  };

  const deleteMeal = (m: Meal) => {
    store.remove(m.id);
    toast('Meal removed', { label: 'Undo', run: () => store.put({ ...m, deleted: false }) });
  };

  const isThisWeek = start === weekStart(t);
  const atToday = mode === 'day' ? selected === t : isThisWeek;
  const goToday = () => setSelected(t);
  const move = (n: number) => {
    if (!device.swiped) store.setDevice({ swiped: true });
    setSelected(addDays(selected, n));
    setShowPast(false);
  };
  // the month (or months) on screen, with the year when it isn't this one
  const monthOf = (d: string) => fromISO(d).toLocaleDateString('en-GB', { month: 'long', ...(d.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) });
  const month =
    mode === 'day' || monthOf(start) === monthOf(addDays(start, 6))
      ? monthOf(mode === 'day' ? selected : start)
      : `${fromISO(start).toLocaleDateString('en-GB', { month: 'short' })} – ${fromISO(addDays(start, 6)).toLocaleDateString('en-GB', { month: 'short' })}`;
  // the week view, this week: days already gone fold away behind one line
  const past = isThisWeek ? days.filter((d) => d < t) : [];
  const weekDays = showPast ? days : days.filter((d) => !past.includes(d));

  const totals = (date: string) =>
    totalsFor.length > 0 && (
      <span className="day-totals">
        {totalsFor.map((p) => {
          const tot = dayTotal(mealsByDate.get(date) ?? [], p, lookup);
          if (!tot.meals) return null;
          const target = settings.tracking[p].kcal;
          return (
            <span key={p} className={`day-total ${p}`}>
              {totalsFor.length > 1 ? `${settings.names[p][0]} ` : ''}
              {fmtKcal(tot.sum.kcal)}
              {target ? ` / ${target}` : ''} kcal{tot.uncounted ? '*' : ''}
            </span>
          );
        })}
      </span>
    );

  return (
    <>
      <div className="cal-row">
        <strong className="cal-month">{month}</strong>
        <button className={`today-btn${atToday ? ' hidden' : ''}`} onClick={goToday} tabIndex={atToday ? -1 : 0} aria-hidden={atToday}>
          <Icon name="left" size={13} stroke={3} /> Today
        </button>
        <div className="cal-mode">
          <Seg<'day' | 'week'> value={mode} onChange={(m) => store.setDevice({ calMode: m })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        </div>
      </div>

      {mode === 'day' ? (
        <>
          <DateStrip selected={selected} today={t} onPick={setSelected} hasMeals={(d) => mealsOn(d).length > 0} />
          <Swipeable onPrev={() => move(-1)} onNext={() => move(1)}>
            <div key={selected} className={dir ? `slide-in-${dir}` : undefined}>
          <DayCard
            date={selected}
            today={t}
            meals={mealsOn(selected)}
            view={view}
            lookup={lookup}
            totals={totals(selected)}
            onOpen={(m) => setEditing({ meal: m, body: m, date: selected })}
            onAdd={(slot) => add(selected, slot)}
            onAddMenu={() => setSheet('add-menu')}
          />
            </div>
          </Swipeable>
          {!device.swiped && <p className="swipe-hint">Swipe the day sideways to move between days</p>}
          <ClearMeals dates={[selected]} view={view} label={fromISO(selected).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')} />
        </>
      ) : (
        <>
        <WeekStrip start={start} today={t} onMove={move} />
        <Swipeable onPrev={() => move(-7)} onNext={() => move(7)}>
          <div key={start} className={dir ? `slide-in-${dir}` : undefined}>
          {past.length > 0 && (
            <button className="past-toggle" onClick={() => setShowPast((x) => !x)} aria-expanded={showPast}>
              <Icon name={showPast ? 'up' : 'down'} size={16} />
              {showPast ? 'Hide earlier days' : past.length === 1 ? `Show ${weekday(past[0])}` : `Show earlier days (${weekday(past[0])}–${weekday(past[past.length - 1])})`}
            </button>
          )}
          {weekDays.map((date) => {
            const meals = mealsOn(date);
            return (
              <section key={date} className={`card day week-day${date === t ? ' today' : ''}${date < t ? ' past' : ''}`}>
                <header className="day-head">
                  <button className="day-link" onClick={() => { setSelectedRaw(date); setDir(null); store.setDevice({ calMode: 'day' }); }}>
                    <strong>{dayLabel(date)}</strong>
                  </button>
                  {date === t && <span className="today-badge">Today</span>}
                  {totals(date)}
                  <button className="slot-add" onClick={() => add(date)} aria-label={`Add a meal on ${dayLabel(date)}`}>
                    <Icon name="plus" size={16} />
                  </button>
                </header>
                {meals.length === 0 ? (
                  <button className="week-empty" onClick={() => add(date)}>Nothing planned</button>
                ) : (
                  SLOTS.filter((s) => meals.some((m) => m.slot === s)).map((slot) => (
                    <div key={slot} className="week-slot">
                      <span className="week-slot-name">{SLOT_LABELS[slot]}</span>
                      <span className="week-meals">
                        {meals
                          .filter((m) => m.slot === slot)
                          .map((m) => (
                            <button key={m.id} className={`week-meal ${m.who}`} onClick={() => setEditing({ meal: m, body: m, date })}>
                              {m.leftovers && <span className="meal-label">Leftovers</span>}
                              {mealTitle(m, lookup.recipe)}
                            </button>
                          ))}
                      </span>
                    </div>
                  ))
                )}
              </section>
            );
          })}
          </div>
        </Swipeable>
        <div className="cal-end">
          <button className="btn primary" onClick={() => setSheet('save-menu')}>
            <Icon name="download" size={18} /> Save this week as a menu
          </button>
          <ClearMeals dates={weekDays} view={view} label="week" />
        </div>
        </>
      )}
      {totalsFor.length > 0 && <p className="small-print">* some meals on that day have no numbers yet (notes, or ingredients without a food).</p>}

      {editing && (
        <MealEditor
          key={editing.meal?.id ?? `${editing.date}-${editing.body.slot}`}
          initial={editing.body}
          date={editing.date}
          onSave={saveMeal}
          onDelete={editing.meal ? () => deleteMeal(editing.meal!) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {sheet === 'add-menu' && <AddMenuSheet defaultStart={mode === 'day' ? selected : start < t ? t : start} onClose={() => setSheet(null)} />}
      {sheet === 'save-menu' && <SaveAsMenuSheet start={start} onClose={() => setSheet(null)} />}
    </>
  );
}

/** One day: the meals planned, slot by slot, and one button to add another. */
function DayCard({
  date,
  today: t,
  meals,
  view,
  lookup,
  totals,
  onOpen,
  onAdd,
  onAddMenu,
}: {
  date: string;
  today: string;
  meals: Meal[];
  view: Who;
  lookup: { recipe: (id: string) => Recipe | undefined };
  totals: ReactNode;
  onOpen: (m: Meal) => void;
  onAdd: (slot?: Slot) => void;
  onAddMenu: () => void;
}) {
  const slots = SLOTS.filter((s) => meals.some((m) => m.slot === s));
  return (
    <section className="card day">
      {totals && <header className="day-head">{totals}</header>}
      {slots.length === 0 && <p className="day-empty">Nothing planned yet.</p>}
      {slots.map((slot) => (
        <div key={slot} className="slot">
          <div className="slot-head">
            <span>{SLOT_LABELS[slot]}</span>
            <button className="slot-add" onClick={() => onAdd(slot)} aria-label={`Add to ${SLOT_LABELS[slot]}`}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div className={`slot-meals${view === 'both' ? ' two' : ''}`}>
            {meals
              .filter((m) => m.slot === slot)
              .map((m) => (
                <div key={m.id} className={`slot-cell ${m.who}`}>
                  <MealChip meal={m} recipe={lookup.recipe} onClick={() => onOpen(m)} />
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="btn-row add-meal">
        <button className="btn grow-btn" onClick={() => onAdd()}>
          <Icon name="plus" size={18} /> Add a meal
        </button>
        <button className="btn grow-btn" onClick={onAddMenu}>
          <Icon name="list" size={18} /> Add a menu
        </button>
      </div>
    </section>
  );
}

/**
 * Clear the meals on a day or the days of the week on screen, for whoever's being viewed.
 * In one person's view their own meals go, and shared meals become the other person's (they
 * may still be eating it). In Both, everything goes. Needs a press and hold; can be undone.
 */
function ClearMeals({ dates, view, label }: { dates: string[]; view: Who; label: string }) {
  const { mealsByDate, settings } = useStore();
  const all = dates.flatMap((d) => mealsByDate.get(d) ?? []);
  const other: Person | null = view === 'tom' ? 'nuria' : view === 'nuria' ? 'tom' : null;
  const remove = all.filter((m) => view === 'both' || m.who === view);
  const handOver = other ? all.filter((m) => m.who === 'both') : [];
  const n = remove.length + handOver.length;
  if (!n) return null;
  const whose = view === 'both' ? '' : `${settings.names[view]}’s `;
  const what = label === 'week' ? `${whose || 'this '}week` : `${whose}${label}`;

  const clear = () => {
    store.put(...remove.map((m) => ({ ...m, deleted: true })), ...handOver.map((m) => ({ ...m, who: other! })));
    toast(`Cleared ${n} meal${n === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...remove.map((m) => ({ ...m, deleted: false })), ...handOver) }, 10000);
  };

  return (
    <div className="clear-all">
      <HoldButton className="danger-soft" onDone={clear} holdingLabel="Keep holding to clear…">
        <Icon name="trash" size={18} /> Hold to clear {what}
      </HoldButton>
      <p className="small-print">
        {view === 'both' ? `Removes all ${n} meal${n === 1 ? '' : 's'} shown.` : `Removes ${settings.names[view]}’s meals; ${settings.names[other!]}’s stay.`}
        {handOver.length ? ` ${handOver.length} shared meal${handOver.length === 1 ? '' : 's'} stay${handOver.length === 1 ? 's' : ''} on ${settings.names[other!]}’s calendar.` : ''} You can undo straight afterwards.
      </p>
    </div>
  );
}

/** The week line: this week in the middle, the weeks either side peeking in. Tap one to go there. */
function WeekStrip({ start, today, onMove }: { start: string; today: string; onMove: (days: number) => void }) {
  const name = (ws: string) => {
    const n = dayDiff(weekStart(today), ws) / 7;
    return n === 0 ? 'This week' : n === 1 ? 'Next week' : n === -1 ? 'Last week' : n > 0 ? `In ${n} weeks` : `${-n} weeks ago`;
  };
  const range = (ws: string) => rangeLabel(ws, addDays(ws, 6));
  const prev = addDays(start, -7);
  const next = addDays(start, 7);
  return (
    <div className="week-strip">
      <button className="ws-side prev" onClick={() => onMove(-7)} aria-label={`Go to ${name(prev)}, ${range(prev)}`}>
        <strong>{name(prev)}</strong>
        <span>{range(prev)}</span>
      </button>
      <div className="ws-now">
        <strong>{name(start)}</strong>
        <span>{fromISO(start).toLocaleDateString('en-GB', { day: 'numeric' })} – {fromISO(addDays(start, 6)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>
      </div>
      <button className="ws-side next" onClick={() => onMove(7)} aria-label={`Go to ${name(next)}, ${range(next)}`}>
        <strong>{name(next)}</strong>
        <span>{range(next)}</span>
      </button>
    </div>
  );
}
