import { useMemo, useState } from 'react';
import { HoldButton, Icon, Seg, Sheet, toast } from './ui';
import { WhoTag, useView } from './WhoSwitch';
import { newId, store, useStore } from '../lib/store';
import { addDays, fromISO, isISODate } from '../lib/dates';
import { countMeals, dayLabel, daysToMenu, isUniform, planApply, rangeLabel } from '../lib/plan';
import { visibleIn, type Entry, type Menu, type Who } from '../lib/types';

/** Calendar → "Add a menu": pick which menu, then where it goes. */
export function AddMenuSheet({ defaultStart, onClose }: { defaultStart: string; onClose: () => void }) {
  const { menus } = useStore();
  const view = useView();
  const [menu, setMenu] = useState<Menu | null>(null);
  if (menu) return <AddToCalendarSheet menu={menu} defaultStart={defaultStart} onClose={onClose} />;
  const list = [...menus].sort((a, b) => Number(visibleIn(b.owner, view)) - Number(visibleIn(a.owner, view)));
  return (
    <Sheet title="Add a menu" onClose={onClose}>
      {list.length ? (
        <div className="card list">
          {list.map((m) => (
            <button key={m.id} className="row" onClick={() => setMenu(m)}>
              <span className="row-main">
                <span className="row-title">{m.name}</span>
                <span className="row-sub">{m.days.length} day{m.days.length === 1 ? '' : 's'} · {countMeals(m.days)} meals</span>
              </span>
              <span className="row-amt"><WhoTag who={m.owner} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">No menus yet. Make one in the Menus tab, import Nuria’s spreadsheet there, or plan a week and save it as a menu.</div>
      )}
    </Sheet>
  );
}

const fmtDay = (d: string) => fromISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Put a menu on the calendar: from a date, for x days, for Tom, Nuria or both. */
export function AddToCalendarSheet({ menu, defaultStart, onClose }: { menu: Menu; defaultStart: string; onClose: () => void }) {
  const { settings, mealsByDate, device } = useStore();
  const [start, setStart] = useState(defaultStart);
  const [days, setDays] = useState(String(menu.days.length || 7));
  const uniform = isUniform(menu);
  const [forWho, setForWho] = useState<Who>(uniform ? menu.days.flatMap((d) => d.meals)[0]?.who ?? menu.owner : 'both');
  const [mode, setMode] = useState<'fill' | 'replace'>('fill');
  const n = Math.max(0, Math.min(62, Math.round(Number(days) || 0)));

  const plan = useMemo(
    () => (isISODate(start) && n > 0 ? planApply(menu, { start, days: n, forWho, mode }, mealsByDate, newId, device.me) : null),
    [menu, start, n, forWho, mode, mealsByDate, device.me],
  );
  const kept = useMemo(() => {
    if (!plan || mode !== 'fill' || !isISODate(start)) return 0;
    const full = planApply(menu, { start, days: n, forWho, mode: 'replace' }, mealsByDate, newId);
    return full.add.length - plan.add.length;
  }, [plan, mode, menu, start, n, forWho, mealsByDate]);

  const apply = () => {
    if (!plan?.add.length) return;
    const before: Entry[] = [...plan.remove, ...plan.update.map((u) => mealsByDate.get(u.date)!.find((m) => m.id === u.id)!)];
    store.put(...plan.add, ...plan.update, ...plan.remove.map((m) => ({ ...m, deleted: true })));
    toast(`Added ${plan.add.length} meals`, {
      label: 'Undo',
      run: () => store.put(...plan.add.map((m) => ({ ...m, deleted: true })), ...before.map((e) => ({ ...e, deleted: false }))),
    });
    onClose();
  };

  const end = isISODate(start) && n > 0 ? addDays(start, n - 1) : start;
  const repeats = n > menu.days.length && menu.days.length > 0;
  return (
    <Sheet
      title={`Add “${menu.name}”`}
      onClose={onClose}
      footer={
        // replacing meals already planned needs a press and hold, so it can't happen by accident
        mode === 'replace' && plan && plan.add.length > 0 && plan.remove.length + plan.update.length > 0 ? (
          <HoldButton className="danger-fill" onDone={apply} holdingLabel="Keep holding to replace…">
            Hold to replace {plan.remove.length + plan.update.length} &amp; add {plan.add.length} meals
          </HoldButton>
        ) : (
        <button className="btn primary save" disabled={!plan?.add.length} onClick={apply}>
          <span>{plan?.add.length ? `Add ${plan.add.length} meals` : 'Nothing to add'}</span>
          {isISODate(start) && n > 0 && <span className="save-sub">{n === 1 ? fmtDay(start) : `${fmtDay(start)} – ${fmtDay(end)}`}</span>}
        </button>
        )
      }
    >
      <div className="inline">
        <div className="field">
          <label htmlFor="as">Starting</label>
          <input id="as" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label htmlFor="ad">For how many days</label>
          <input id="ad" className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </div>
      <p className="small-print" style={{ marginTop: -8, marginBottom: 14 }}>
        Day 1 of the menu lands on {isISODate(start) ? dayLabel(start) : 'the start date'}.
        {repeats ? ` The ${menu.days.length}-day menu repeats to fill ${n} days.` : n < menu.days.length && n > 0 ? ` Uses the first ${n} of its ${menu.days.length} days.` : ''}
      </p>
      <div className="field">
        <span className="field-label">{uniform ? 'Who these meals are for' : 'Whose meals to add'}</span>
        <Seg<Who>
          value={forWho}
          onChange={setForWho}
          options={
            uniform
              ? [
                  { value: 'tom', label: settings.names.tom, className: 'tom' },
                  { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
                  { value: 'both', label: 'Both' },
                ]
              : [
                  { value: 'both', label: 'As planned' },
                  { value: 'tom', label: `${settings.names.tom}’s`, className: 'tom' },
                  { value: 'nuria', label: `${settings.names.nuria}’s`, className: 'nuria' },
                ]
          }
        />
      </div>
      <div className="field">
        <span className="field-label">Meals already planned</span>
        <Seg<'fill' | 'replace'> value={mode} onChange={setMode} options={[{ value: 'fill', label: 'Keep them' }, { value: 'replace', label: 'Replace them' }]} />
      </div>
      {plan && (
        <div className="note">
          {mode === 'fill'
            ? kept
              ? `${kept} meal${kept === 1 ? '' : 's'} skipped where something is already planned.`
              : 'Nothing planned in those days yet.'
            : plan.remove.length + plan.update.length
              ? `${plan.remove.length + plan.update.length} planned meal${plan.remove.length + plan.update.length === 1 ? '' : 's'} will be replaced. You can undo.`
              : 'Nothing planned in those days yet.'}
        </div>
      )}
    </Sheet>
  );
}

/** Calendar → "Save week as menu". */
export function SaveAsMenuSheet({ start: initialStart, onClose }: { start: string; onClose: () => void }) {
  const { settings, mealsByDate, device } = useStore();
  const view = useView();
  const [start, setStart] = useState(initialStart);
  const [days, setDays] = useState('7');
  const [forWho, setForWho] = useState<Who>(view);
  const [name, setName] = useState(`Week of ${fromISO(initialStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
  const n = Math.max(1, Math.min(62, Math.round(Number(days) || 0)));
  const menuDays = isISODate(start) ? daysToMenu(mealsByDate, start, n, forWho) : [];
  const count = countMeals(menuDays);

  const save = () => {
    const menu: Menu = { id: newId(), kind: 'menu', name: name.trim() || 'Untitled menu', owner: forWho, days: menuDays, createdBy: device.me, updatedAt: 0 };
    store.put(menu);
    toast(`Saved “${menu.name}” to Menus`);
    onClose();
  };

  return (
    <Sheet
      title="Save as a menu"
      onClose={onClose}
      footer={
        <button className="btn primary save" disabled={!count} onClick={save}>
          <span>{count ? `Save ${count} meals as a menu` : 'No meals in those days'}</span>
          {isISODate(start) && <span className="save-sub">{rangeLabel(start, addDays(start, n - 1))}</span>}
        </button>
      }
    >
      <div className="field">
        <label htmlFor="sn">Menu name</label>
        <input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="inline">
        <div className="field">
          <label htmlFor="ss">From</label>
          <input id="ss" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label htmlFor="sd">Days</label>
          <input id="sd" className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Whose meals</span>
        <Seg<Who>
          value={forWho}
          onChange={setForWho}
          options={[
            { value: 'tom', label: settings.names.tom, className: 'tom' },
            { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </div>
      <p className="small-print">
        <Icon name="list" size={14} /> Days are saved as Day 1, Day 2…, so the menu can start on any day later.
      </p>
    </Sheet>
  );
}
