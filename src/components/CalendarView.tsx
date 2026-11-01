import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  };
  // a swipe slides the content itself, so no extra slide-in animation
  const swipe = (n: number) => {
    if (!device.swiped) store.setDevice({ swiped: true });
    setDir(null);
    setSelectedRaw(addDays(selected, n));
  };
  const ahead = mode === 'day' ? selected > t : start > weekStart(t);
  const todayLabel = mode === 'week' ? 'This week' : 'Today';
  // the month (or months) on screen, with the year when it isn't this one
  const monthOf = (d: string) => fromISO(d).toLocaleDateString('en-GB', { month: 'long', ...(d.slice(0, 4) !== t.slice(0, 4) ? { year: 'numeric' } : {}) });
  const month =
    mode === 'day' || monthOf(start) === monthOf(addDays(start, 6))
      ? monthOf(mode === 'day' ? selected : start)
      : `${fromISO(start).toLocaleDateString('en-GB', { month: 'short' })} – ${fromISO(addDays(start, 6)).toLocaleDateString('en-GB', { month: 'short' })}`;
  // the week view, this week: days already gone fold away behind one line
  const weekDays = days;

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
          {ahead ? <><Icon name="left" size={13} stroke={3} /> {todayLabel}</> : <>{todayLabel} <Icon name="right" size={13} stroke={3} /></>}
        </button>
        <div className="cal-mode">
          <Seg<'day' | 'week'> value={mode} onChange={(m) => store.setDevice({ calMode: m })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        </div>
      </div>

      {mode === 'day' ? (
        <>
          <DateStrip selected={selected} today={t} onPick={setSelected} hasMeals={(d) => mealsOn(d).length > 0} />
          <Swipeable
            onPrev={() => swipe(-1)}
            onNext={() => swipe(1)}
            panel={(o) => {
              const date = addDays(selected, o);
              return {
                key: date,
                node: (
                  <div className={!o && dir ? `slide-in-${dir}` : undefined}>
                    <DayCard
                      date={date}
                      today={t}
                      meals={mealsOn(date)}
                      view={view}
                      lookup={lookup}
                      totals={totals(date)}
                      onOpen={(m) => setEditing({ meal: m, body: m, date })}
                      onAdd={(slot) => add(date, slot)}
                      onAddMenu={() => setSheet('add-menu')}
                    />
                  </div>
                ),
              };
            }}
          />
          {!device.swiped && <p className="swipe-hint">Swipe the day sideways to move between days</p>}
          <ClearMeals dates={[selected]} view={view} label={fromISO(selected).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')} />
        </>
      ) : (
        <>
        <Swipeable
          onPrev={() => swipe(-7)}
          onNext={() => swipe(7)}
          head={<WeekStrip start={start} today={t} onMove={move} />}
          panel={(o) => {
            const ws = addDays(start, 7 * o);
            return {
              key: ws,
              node: (
                <div className={!o && dir ? `slide-in-${dir}` : undefined}>
          {daysFrom(ws, 7).map((date) => {
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
              ),
            };
          }}
        />
        <div className="cal-end">
          <button className="btn primary" onClick={() => setSheet('save-menu')}>
            <Icon name="download" size={18} /> Save this week as a menu
          </button>
          <ClearMeals dates={weekDays} view={view} label="week" />
        </div>
        </>
      )}
      {totalsFor.length > 0 && <p className="small-print">* Some meals have no calorie numbers yet.</p>}

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
      {handOver.length > 0 && <p className="small-print">Shared meals stay on {settings.names[other!]}’s calendar.</p>}
    </div>
  );
}

/**
 * The week line: a strip of week tiles, the picked week in the middle and the weeks either side
 * peeking in. When the week changes the strip slides across to it, like the row of dates in day
 * view. Tap a neighbour to go there.
 */
function WeekStrip({ start, today, onMove }: { start: string; today: string; onMove: (days: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(358);
  // the weeks drawn: a window around the picked one that only moves when you get near its edge
  const [from, setFrom] = useState(() => addDays(start, -7 * 20));
  const [jump, setJump] = useState(false); // re-centring the window: no slide
  const count = 41;
  let i = dayDiff(from, start) / 7;
  if (i < 3 || i > count - 4) {
    const next = addDays(start, -7 * 20);
    if (next !== from) {
      setFrom(next);
      setJump(true);
    }
    i = 20;
  }
  useEffect(() => {
    if (!jump) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setJump(false)));
    return () => cancelAnimationFrame(r);
  }, [jump]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const name = (ws: string) => {
    const n = dayDiff(weekStart(today), ws) / 7;
    return n === 0 ? 'This week' : n === 1 ? 'Next week' : n === -1 ? 'Last week' : '';
  };
  const long = (ws: string) =>
    ws.slice(5, 7) === addDays(ws, 6).slice(5, 7)
      ? `${fromISO(ws).getDate()} – ${fromISO(addDays(ws, 6)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
      : rangeLabel(ws, addDays(ws, 6));
  const tile = Math.round(w * 0.7);
  const gap = 8;
  const x = (w - tile) / 2 - i * (tile + gap);

  return (
    <div className="week-strip" ref={ref}>
      <div className={`ws-track${jump ? ' jump' : ''}`} style={{ transform: `translateX(${x}px)` }}>
        {Array.from({ length: count }, (_, k) => {
          const ws = addDays(from, 7 * k);
          const on = ws === start;
          const n = name(ws);
          return (
            <button
              key={ws}
              className={`ws-tile${on ? ' on' : k < i ? ' before' : ' after'}`}
              style={{ width: tile }}
              tabIndex={on || Math.abs(k - i) === 1 ? 0 : -1}
              aria-current={on ? 'true' : undefined}
              aria-label={on ? undefined : `Go to ${[n, long(ws)].filter(Boolean).join(', ')}`}
              onClick={() => !on && onMove(dayDiff(start, ws))}
            >
              {n ? (
                <>
                  <strong>{n}</strong>
                  <span>{long(ws)}</span>
                </>
              ) : (
                <strong>{long(ws)}</strong>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
