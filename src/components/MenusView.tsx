import { useMemo, useRef, useState } from 'react';
import { Icon, Seg, Sheet, toast } from './ui';
import { WhoSwitch, WhoTag, useView } from './WhoSwitch';
import { MealChip } from './MealChip';
import { MealEditor } from './MealEditor';
import { AddToCalendarSheet } from './MenuSheets';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { addDays, today } from '../lib/dates';
import { countMeals, weekStart } from '../lib/plan';
import { readXlsx } from '../lib/xlsx';
import { findMenus, type FoundMenu } from '../lib/importSheet';
import { SLOT_LABELS, SLOTS, visibleIn, type MealBody, type Menu, type MenuDay, type Slot, type Who } from '../lib/types';

/** Monday next week, or today if it's a Monday. */
const nextMonday = () => {
  const t = today();
  return weekStart(t) === t ? t : addDays(weekStart(t), 7);
};

export function MenusView() {
  const { menus } = useStore();
  const view = useView();
  const [open, setOpen] = useState<Menu | null>(null);
  const [adding, setAdding] = useState<Menu | null>(null);
  const [importing, setImporting] = useState(false);
  const { device } = useStore();

  const shown = menus.filter((m) => visibleIn(m.owner, view));
  const blank = (): Menu => ({ id: newId(), kind: 'menu', name: '', owner: view, days: [{ meals: [] }], createdBy: device.me, updatedAt: 0 });

  return (
    <>
      <WhoSwitch />
      <div className="btn-row" style={{ margin: '12px 0 6px' }}>
        <button className="btn small grow-btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={18} /> Import spreadsheet
        </button>
      </div>

      {shown.length ? (
        <div className="card list">
          {shown.map((m) => (
            <div key={m.id} className="row menu-row">
              <button className="row-main" onClick={() => setOpen(m)} style={{ textAlign: 'left' }}>
                <span className="row-title">{m.name}</span>
                <span className="row-sub">
                  {m.days.length} day{m.days.length === 1 ? '' : 's'} · {countMeals(m.days)} meals
                </span>
              </button>
              <WhoTag who={m.owner} />
              <button className="btn small" onClick={() => setAdding(m)}>Use</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-icon"><Icon name="calendar" size={26} /></div>
          <p style={{ margin: '0 0 4px', fontWeight: 650, color: 'var(--text)' }}>No menus{menus.length ? ' in this view' : ' yet'}</p>
          <p style={{ margin: 0 }}>A menu is a run of days you can drop onto the calendar in one go. Import Nuria’s spreadsheet, build one here, or save a planned week from the Calendar.</p>
        </div>
      )}

      <div className="home-actions">
        <button className="btn primary add" onClick={() => setOpen(blank())}>
          <Icon name="plus" size={22} stroke={2.4} /> New menu
        </button>
      </div>

      {open && <MenuEditor initial={open} isNew={!menus.some((m) => m.id === open.id)} onClose={() => setOpen(null)} onUse={(m) => { setOpen(null); setAdding(m); }} />}
      {adding && <AddToCalendarSheet menu={adding} defaultStart={nextMonday()} onClose={() => setAdding(null)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </>
  );
}

type EditingMeal = { day: number; index?: number; body: MealBody } | null;

function MenuEditor({ initial, isNew, onClose, onUse }: { initial: Menu; isNew: boolean; onClose: () => void; onUse: (m: Menu) => void }) {
  const { settings, recipes } = useStore();
  const [m, setM] = useState<Menu>(initial);
  const [orig] = useState(JSON.stringify(initial));
  const [editing, setEditing] = useState<EditingMeal>(null);
  const dirty = JSON.stringify(m) !== orig;
  const recipe = (id: string) => recipes.find((r) => r.id === id);

  const setDay = (i: number, day: MenuDay) => setM({ ...m, days: m.days.map((d, j) => (j === i ? day : d)) });

  const clean = (): Menu => ({ ...m, name: m.name.trim() || 'Untitled menu' });
  const save = () => {
    store.put(clean());
    toast(isNew ? 'Menu added' : 'Menu saved');
    onClose();
  };
  const remove = () => {
    store.remove(initial.id);
    toast('Menu deleted', { label: 'Undo', run: () => store.put({ ...initial, deleted: false }) });
    onClose();
  };

  return (
    <Sheet
      title={isNew ? 'New menu' : 'Edit menu'}
      onClose={onClose}
      full
      dirty={dirty}
      footer={
        <div className="btn-row">
          {!isNew && (
            <button className="btn delete" onClick={remove} aria-label="Delete menu">
              <Icon name="trash" size={20} />
            </button>
          )}
          {!isNew && !dirty ? (
            <button className="btn primary" onClick={() => onUse(m)}>Add to calendar</button>
          ) : (
            <button className="btn primary" onClick={save}>Save menu</button>
          )}
        </div>
      }
    >
      <div className="field">
        <label htmlFor="mn">Name</label>
        <input id="mn" className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="e.g. Week 1" />
      </div>
      <div className="field">
        <span className="field-label">Whose menu</span>
        <Seg<Who>
          value={m.owner}
          onChange={(owner) => setM({ ...m, owner })}
          options={[
            { value: 'tom', label: settings.names.tom, className: 'tom' },
            { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>

      {m.days.map((day, i) => {
        const empty = SLOTS.filter((s) => !day.meals.some((x) => x.slot === s));
        return (
          <section key={i} className="card day">
            <header className="day-head">
              <strong>Day {i + 1}</strong>
              <span className="day-actions">
                <button className="link-btn small" onClick={() => setM({ ...m, days: [...m.days.slice(0, i + 1), structuredClone(day), ...m.days.slice(i + 1)] })}>Copy</button>
                {m.days.length > 1 && (
                  <button className="link-btn small danger" onClick={() => setM({ ...m, days: m.days.filter((_, j) => j !== i) })}>Remove</button>
                )}
              </span>
            </header>
            {SLOTS.filter((s) => !empty.includes(s)).map((slot) => (
              <div key={slot} className="slot">
                <div className="slot-head">
                  <span>{SLOT_LABELS[slot]}</span>
                  <button className="slot-add" onClick={() => setEditing({ day: i, body: blankBody(slot, m.owner) })} aria-label={`Add to ${SLOT_LABELS[slot]}`}>
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                <div className="slot-meals">
                  {day.meals.map((meal, j) =>
                    meal.slot === slot ? (
                      <div key={j} className={`slot-cell ${meal.who}`}>
                        <MealChip meal={meal} recipe={recipe} onClick={() => setEditing({ day: i, index: j, body: meal })} />
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
            {empty.length > 0 && (
              <div className="add-row">
                {empty.map((s) => (
                  <button key={s} className="add-chip" onClick={() => setEditing({ day: i, body: blankBody(s, m.owner) })}>
                    <Icon name="plus" size={14} /> {SLOT_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <button className="btn" onClick={() => setM({ ...m, days: [...m.days, { meals: [] }] })}>
        <Icon name="plus" size={18} /> Add a day
      </button>

      {editing && (
        <MealEditor
          initial={editing.body}
          dayName={`Day ${editing.day + 1}`}
          onSave={(body) => {
            const day = m.days[editing.day];
            const meals = editing.index == null ? [...day.meals, body] : day.meals.map((x, j) => (j === editing.index ? body : x));
            setDay(editing.day, { meals });
          }}
          onDelete={editing.index == null ? undefined : () => setDay(editing.day, { meals: m.days[editing.day].meals.filter((_, j) => j !== editing.index) })}
          onClose={() => setEditing(null)}
        />
      )}
    </Sheet>
  );
}

const blankBody = (slot: Slot, who: Who): MealBody => ({ slot, who, content: { type: 'note', text: '' } });

/** Import menus from a spreadsheet laid out like Nuria's. */
function ImportSheet({ onClose }: { onClose: () => void }) {
  const { settings, device } = useStore();
  const foods = useFoods();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<ReturnType<typeof readXlsx> | null>(null);
  const [who, setWho] = useState<Who>('both');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const found: FoundMenu[] = useMemo(() => (sheets && foods.ready ? findMenus(sheets, who, foods.foods) : []), [sheets, who, foods]);

  const load = async (f?: File) => {
    if (!f) return;
    setError(undefined);
    try {
      const s = readXlsx(new Uint8Array(await f.arrayBuffer()));
      setSheets(s);
      setPicked({});
      setNames({});
    } catch {
      setError('Couldn’t read that file. It needs to be an Excel .xlsx file (in Google Sheets: File → Download → Microsoft Excel).');
    }
  };

  const chosen = found.filter((m) => picked[m.key] ?? true);
  const run = () => {
    const menus: Menu[] = chosen.map((f) => ({
      id: newId(),
      kind: 'menu',
      name: (names[f.key] ?? f.name).trim() || f.name,
      owner: who,
      days: f.days,
      notes: `Imported from the “${f.sheet}” sheet`,
      createdBy: device.me,
      updatedAt: 0,
    }));
    store.put(...menus);
    toast(`Imported ${menus.length} menu${menus.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...menus.map((x) => ({ ...x, deleted: true }))) });
    onClose();
  };

  return (
    <Sheet
      title="Import a spreadsheet"
      onClose={onClose}
      full
      footer={
        sheets ? (
          <button className="btn primary" disabled={!chosen.length} onClick={run}>
            Import {chosen.length} menu{chosen.length === 1 ? '' : 's'}
          </button>
        ) : undefined
      }
    >
      {!sheets ? (
        <>
          <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
            Choose an Excel file laid out with <strong>Breakfast</strong>, <strong>Lunch</strong>, <strong>Snacks</strong> and <strong>Dinner</strong> columns and a row per
            day. Each sheet becomes a menu.
          </p>
          <button className="dropzone" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={28} />
            <strong>Choose .xlsx file</strong>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <p className="small-print" style={{ color: 'var(--danger)' }}>{error}</p>}
          <p className="small-print">
            The spreadsheet’s calorie numbers aren’t copied: they’re worked out again from the UK food data. Anything the app can’t match is marked for you to check.
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <span className="field-label">These meals are for</span>
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
          {!foods.ready && <p className="small-print">Loading the food list…</p>}
          {foods.ready && !found.length && <div className="empty">No sheets with Breakfast / Lunch / Dinner columns found.</div>}
          {found.length > 0 && (
            <div className="card set-group">
              {found.map((f) => {
                const on = picked[f.key] ?? true;
                const items = f.days.flatMap((d) => d.meals).filter((x) => x.content.type === 'items');
                const unmatched = items.flatMap((x) => (x.content.type === 'items' ? x.content.ingredients : [])).filter((i) => i.foodId === undefined).length;
                return (
                  <div key={f.key} className="set-row import-row">
                    <input type="checkbox" checked={on} onChange={(e) => setPicked({ ...picked, [f.key]: e.target.checked })} aria-label={`Import ${f.name}`} />
                    <span className="grow">
                      <input className="input" value={names[f.key] ?? f.name} onChange={(e) => setNames({ ...names, [f.key]: e.target.value })} aria-label="Menu name" disabled={!on} />
                      <span className="hint">
                        {f.days.length} days{f.dayNames.some(Boolean) ? ` (${f.dayNames.filter(Boolean)[0]}–${f.dayNames.filter(Boolean).at(-1)})` : ''} · {countMeals(f.days)} meals
                        {unmatched ? ` · ${unmatched} items to check` : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="small-print">Untick any sheets you don’t want (e.g. old trials). You can rename them now or later.</p>
        </>
      )}
    </Sheet>
  );
}
