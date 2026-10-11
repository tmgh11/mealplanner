import { useMemo, useState } from 'react';
import { Icon, toast } from './ui';
import { WhoSwitch, useView } from './WhoSwitch';
import { MealChip } from './MealChip';
import { MealEditor } from './MealEditor';
import { useTracking } from './RecipesView';
import { AddMenuSheet, SaveAsMenuSheet } from './MenuSheets';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { addDays, today } from '../lib/dates';
import { dayLabel, dayTotal, daysFrom, mealNutrition, peopleOf, rangeLabel, weekStart } from '../lib/plan';
import { fmtKcal } from '../lib/nutrition';
import { SLOT_LABELS, SLOTS, visibleIn, type Meal, type MealBody, type Person, type Slot, type Who } from '../lib/types';

type Editing = { meal?: Meal; body: MealBody; date: string } | null;

export function CalendarView() {
  const { mealsByDate, recipes, settings, device } = useStore();
  const view = useView();
  const foods = useFoods();
  const tracking = useTracking();
  const [start, setStart] = useState(() => weekStart(today()));
  const [editing, setEditing] = useState<Editing>(null);
  const [sheet, setSheet] = useState<'add-menu' | 'save-menu' | null>(null);

  const days = daysFrom(start, 7);
  const t = today();
  const lookup = useMemo(() => ({ recipe: (id: string) => recipes.find((r) => r.id === id), food: foods.get }), [recipes, foods]);
  const shownPeople: Person[] = peopleOf(view);
  const totalsFor = tracking ? shownPeople.filter((p) => settings.tracking[p].on) : [];

  const add = (date: string, slot: Slot) => {
    const who: Who = view;
    setEditing({ date, body: { slot, who, content: { type: 'note', text: '' } } });
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

  return (
    <>
      <WhoSwitch />
      <div className="week-nav">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
          <Icon name="left" size={18} />
        </button>
        <div className="week-title">
          <strong>{rangeLabel(start, addDays(start, 6))}</strong>
          {isThisWeek ? <span className="muted">This week</span> : <button className="link-btn small" onClick={() => setStart(weekStart(t))}>Back to this week</button>}
        </div>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn small grow-btn" onClick={() => setSheet('add-menu')}>
          <Icon name="list" size={18} /> Add a menu
        </button>
        <button className="btn small grow-btn" onClick={() => setSheet('save-menu')}>
          <Icon name="download" size={18} /> Save as menu
        </button>
      </div>

      {days.map((date) => {
        const all = mealsByDate.get(date) ?? [];
        const meals = all.filter((m) => visibleIn(m.who, view));
        const empty = SLOTS.filter((s) => !meals.some((m) => m.slot === s));
        return (
          <section key={date} className={`card day${date === t ? ' today' : ''}`}>
            <header className="day-head">
              <strong>{dayLabel(date)}</strong>
              {date === t && <span className="today-badge">Today</span>}
              {totalsFor.length > 0 && (
                <span className="day-totals">
                  {totalsFor.map((p) => {
                    const tot = dayTotal(all, p, lookup);
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
              )}
            </header>
            {SLOTS.filter((s) => !empty.includes(s)).map((slot) => {
              const inSlot = meals.filter((m) => m.slot === slot);
              return (
                <div key={slot} className="slot">
                  <div className="slot-head">
                    <span>{SLOT_LABELS[slot]}</span>
                    <button className="slot-add" onClick={() => add(date, slot)} aria-label={`Add to ${SLOT_LABELS[slot]}`}>
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <div className={`slot-meals${view === 'both' ? ' two' : ''}`}>
                    {inSlot.map((m) => {
                      const kcal =
                        tracking && view !== 'both'
                          ? (() => {
                              const r = mealNutrition(m, view as Person, lookup);
                              return r && r.n.kcal ? `${fmtKcal(r.n.kcal)} kcal` : undefined;
                            })()
                          : undefined;
                      return (
                        <div key={m.id} className={`slot-cell ${m.who}`}>
                          <MealChip meal={m} recipe={lookup.recipe} kcal={kcal} onClick={() => setEditing({ meal: m, body: m, date })} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {empty.length > 0 && (
              <div className="add-row">
                {empty.map((s) => (
                  <button key={s} className="add-chip" onClick={() => add(date, s)}>
                    <Icon name="plus" size={14} /> {SLOT_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
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
      {sheet === 'add-menu' && <AddMenuSheet defaultStart={start < t ? t : start} onClose={() => setSheet(null)} />}
      {sheet === 'save-menu' && <SaveAsMenuSheet start={start} onClose={() => setSheet(null)} />}
    </>
  );
}
