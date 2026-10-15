import { useMemo, useState, type ReactNode } from 'react';
import { HoldButton, Icon, MoreMenu, Seg, Sheet, toast } from './ui';
import { WhoSwitch, useView } from './WhoSwitch';
import { MealChip } from './MealChip';
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
  const [start, setStart] = useState(() => weekStart(t));
  const [selected, setSelected] = useState(t);
  const [editing, setEditing] = useState<Editing>(null);
  const [sheet, setSheet] = useState<'add-menu' | 'save-menu' | 'clear' | null>(null);
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
  const goWeek = (n: number) => {
    setStart(addDays(start, 7 * n));
    setSelected(addDays(selected, 7 * n));
    setShowPast(false);
  };
  const backToToday = () => {
    setStart(weekStart(t));
    setSelected(t);
  };
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
      <WhoSwitch />
      <div className="week-nav">
        <button className="icon-btn" onClick={() => goWeek(-1)} aria-label="Previous week">
          <Icon name="left" size={18} />
        </button>
        <div className="week-title">
          <strong>{rangeLabel(start, addDays(start, 6))}</strong>
          <span className="week-sub">
            {isThisWeek && (mode === 'week' || selected === t) ? <span className="muted">This week</span> : <button className="link-btn small" onClick={backToToday}>Back to today</button>}
          </span>
        </div>
        <button className="icon-btn" onClick={() => goWeek(1)} aria-label="Next week">
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="cal-bar">
        <Seg<'day' | 'week'> value={mode} onChange={(m) => store.setDevice({ calMode: m })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        <MoreMenu
          label="Calendar options"
          items={[
            { label: 'Add a menu', icon: 'list', run: () => setSheet('add-menu') },
            { label: 'Save as a menu', icon: 'download', run: () => setSheet('save-menu') },
            {
              label: `Clear ${view === 'both' ? '' : `${settings.names[view]}’s meals `}${mode === 'day' ? 'this day' : 'this week'}`,
              icon: 'trash',
              danger: true,
              run: () => setSheet('clear'),
            },
          ]}
        />
      </div>

      {mode === 'day' ? (
        <>
          <div className="date-strip" role="tablist">
            {days.map((d) => {
              const n = mealsOn(d).length;
              return (
                <button key={d} role="tab" aria-selected={d === selected} className={`date-pill${d === selected ? ' on' : ''}${d === t ? ' today' : ''}${d < t ? ' past' : ''}`} onClick={() => setSelected(d)}>
                  <span className="dp-day">{weekday(d)}</span>
                  <span className="dp-num">{fromISO(d).getDate()}</span>
                  <span className={`dp-dot${n ? ' has' : ''}`} />
                </button>
              );
            })}
          </div>
          <DayCard
            date={selected}
            today={t}
            meals={mealsOn(selected)}
            view={view}
            lookup={lookup}
            totals={totals(selected)}
            onOpen={(m) => setEditing({ meal: m, body: m, date: selected })}
            onAdd={(slot) => add(selected, slot)}
          />
        </>
      ) : (
        <>
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
                  <button className="day-link" onClick={() => { setSelected(date); store.setDevice({ calMode: 'day' }); }}>
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
      {sheet === 'add-menu' && <AddMenuSheet defaultStart={mode === 'day' ? (selected < t ? t : selected) : start < t ? t : start} onClose={() => setSheet(null)} />}
      {sheet === 'save-menu' && <SaveAsMenuSheet start={start} onClose={() => setSheet(null)} />}
      {sheet === 'clear' && <ClearMealsSheet dates={mode === 'day' ? [selected] : weekDays} view={view} onClose={() => setSheet(null)} />}
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
}: {
  date: string;
  today: string;
  meals: Meal[];
  view: Who;
  lookup: { recipe: (id: string) => Recipe | undefined };
  totals: ReactNode;
  onOpen: (m: Meal) => void;
  onAdd: (slot?: Slot) => void;
}) {
  const slots = SLOTS.filter((s) => meals.some((m) => m.slot === s));
  return (
    <section className={`card day${date === t ? ' today' : ''}`}>
      <header className="day-head">
        <strong>{dayLabel(date)}</strong>
        {date === t && <span className="today-badge">Today</span>}
        {totals}
      </header>
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
      <button className="btn add-meal" onClick={() => onAdd()}>
        <Icon name="plus" size={18} /> Add a meal
      </button>
    </section>
  );
}

/**
 * Clear the meals on a day or the days of the week on screen, for whoever's being viewed.
 * In one person's view their own meals go, and shared meals become the other person's (they
 * may still be eating it). In Both, everything goes. Needs a press and hold; can be undone.
 */
function ClearMealsSheet({ dates, view, onClose }: { dates: string[]; view: Who; onClose: () => void }) {
  const { mealsByDate, settings } = useStore();
  const all = dates.flatMap((d) => mealsByDate.get(d) ?? []);
  const other: Person | null = view === 'tom' ? 'nuria' : view === 'nuria' ? 'tom' : null;
  const remove = all.filter((m) => view === 'both' || m.who === view);
  const handOver = other ? all.filter((m) => m.who === 'both') : [];
  const range = dates.length === 1 ? dayLabel(dates[0]) : dates.length ? rangeLabel(dates[0], dates[dates.length - 1]) : '';
  const whose = view === 'both' ? 'all meals' : `${settings.names[view]}’s meals`;
  const n = remove.length + handOver.length;

  const clear = () => {
    store.put(...remove.map((m) => ({ ...m, deleted: true })), ...handOver.map((m) => ({ ...m, who: other! })));
    toast(`Cleared ${n} meal${n === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...remove.map((m) => ({ ...m, deleted: false })), ...handOver) }, 10000);
    onClose();
  };

  return (
    <Sheet
      title={dates.length === 1 ? 'Clear this day?' : 'Clear this week?'}
      onClose={onClose}
      footer={
        n ? (
          <HoldButton className="danger-fill" onDone={clear} holdingLabel="Keep holding to clear…">
            Hold to clear {n} meal{n === 1 ? '' : 's'}
          </HoldButton>
        ) : (
          <button className="btn" onClick={onClose}>Nothing to clear</button>
        )
      }
    >
      <p className="text-2" style={{ marginTop: 0 }}>
        Removes {whose} on <strong>{range}</strong>
        {remove.length ? ` (${remove.length})` : ''}.
      </p>
      {other && handOver.length > 0 && (
        <div className="note">
          {handOver.length} shared meal{handOver.length === 1 ? '' : 's'} will stay on the calendar for {settings.names[other]} only.
        </div>
      )}
      {other && <p className="small-print">{settings.names[other]}’s own meals aren’t touched.</p>}
      <p className="small-print">You can undo straight afterwards.</p>
    </Sheet>
  );
}
