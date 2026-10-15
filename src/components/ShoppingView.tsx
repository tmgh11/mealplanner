import { useMemo, useState } from 'react';
import { HoldButton, Icon, Seg, Sheet, toast } from './ui';
import { WhoSwitch } from './WhoSwitch';
import { newId, store, useStore } from '../lib/store';
import { useFoods } from '../lib/useFoods';
import { addDays, fromISO, isISODate, today } from '../lib/dates';
import { resolveLine } from '../lib/ingredients';
import { checkedGroups, fmtAmount, groupShopping, lineFor, planFromCalendar, toItem, type ShopGroup } from '../lib/shopping';
import { peopleOf } from '../lib/plan';
import { AISLES, type Aisle, type Person, type ShopItem, type Who } from '../lib/types';

/** Lines Tom added or that are for Tom's meals show in Tom's view; Both shows everything. */
const shows = (i: ShopItem, view: Who) =>
  view === 'both' || i.addedBy === view || (i.source?.forWho ? peopleOf(i.source.forWho).includes(view) : false);

export function ShoppingView() {
  const { shopping, settings, device } = useStore();
  // the list has its own Tom / Nuria / Both switch, starting on Both
  const view: Who = device.shopView ?? 'both';
  const foods = useFoods();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<ShopGroup | null>(null);
  const [fromCal, setFromCal] = useState(false);

  const mine = useMemo(() => shopping.filter((i) => shows(i, view)), [shopping, view]);
  const aisles = useMemo(() => groupShopping(mine), [mine]);
  const basket = useMemo(() => checkedGroups(mine), [mine]);
  const toBuy = aisles.reduce((n, a) => n + a.groups.length, 0);

  const addTyped = () => {
    const t = text.trim();
    if (!t) return;
    const r = foods.ready ? resolveLine(t, foods.foods) : null;
    const food = r?.ingredient.foodId ? foods.get(r.ingredient.foodId) : undefined;
    const line = r ? lineFor(r.ingredient, 1, food) : null;
    // typed items keep the words as typed; a matched food only decides the aisle and grouping
    const item = toItem(line ?? { name: t, aisle: 'Other' }, undefined, device.me, newId(), Date.now());
    store.put(item);
    setText('');
  };

  const tick = (g: ShopGroup, checked: boolean) => store.put(...g.items.map((i) => ({ ...i, checked })));

  const clearTicked = () => {
    const ticked = shopping.filter((i) => i.checked && shows(i, view));
    if (!ticked.length) return;
    store.put(...ticked.map((i) => ({ ...i, deleted: true })));
    toast(`Cleared ${ticked.length} ticked item${ticked.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...ticked.map((i) => ({ ...i, deleted: false }))) });
  };

  const who = (p: Person) => <span key={p} className={`who-dot ${p}`} title={`Added by ${settings.names[p]}`} />;

  const row = (g: ShopGroup) => {
    const sources = [...new Set(g.items.map((i) => i.source?.label.split(' · ')[0]).filter(Boolean))];
    return (
      <div key={g.key} className={`shop-row${g.checked ? ' done' : ''}`}>
        <button className="tick" onClick={() => tick(g, !g.checked)} aria-label={`${g.checked ? 'Untick' : 'Tick'} ${g.name}`}>
          {g.checked && <Icon name="check" size={16} stroke={3} />}
        </button>
        <button className="shop-main" onClick={() => setOpen(g)}>
          <span className="shop-line">
            <span className="shop-name">{g.name}</span>
            {g.amount && <span className="shop-amt num">{g.amount}</span>}
          </span>
          <span className="shop-sub">
            {g.addedBy.map(who)}
            <span>{sources.length ? `for ${sources.length > 2 ? `${sources.slice(0, 2).join(', ')} +${sources.length - 2}` : sources.join(', ')}` : `added by ${g.addedBy.map((p) => settings.names[p]).join(' & ')}`}</span>
          </span>
        </button>
      </div>
    );
  };

  return (
    <>
      <WhoSwitch value={view} onChange={(v) => store.setDevice({ shopView: v })} />
      <form
        className="search shop-add"
        onSubmit={(e) => {
          e.preventDefault();
          addTyped();
        }}
      >
        <Icon name="plus" size={18} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item, e.g. milk or 2 tins tomatoes" aria-label="Add an item" enterKeyHint="done" />
        {text.trim() && <button className="btn small primary" type="submit">Add</button>}
      </form>
      <div className="btn-row" style={{ marginBottom: 4 }}>
        <button className="btn small grow-btn" onClick={() => setFromCal(true)}>
          <Icon name="calendar" size={18} /> Add from the calendar
        </button>
      </div>

      {toBuy === 0 && basket.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="cart" size={26} /></div>
          <p style={{ margin: '0 0 4px', fontWeight: 650, color: 'var(--text)' }}>Nothing on the list</p>
          <p style={{ margin: 0 }}>Add what’s needed for the meals on the calendar, add a recipe from its page, or type things in above.</p>
        </div>
      )}

      {aisles.map((a) => (
        <section key={a.aisle}>
          <div className="section-title">{a.aisle}</div>
          <div className="card list shop-list">{a.groups.map(row)}</div>
        </section>
      ))}

      {basket.length > 0 && (
        <section>
          <div className="section-title">
            In the basket · {basket.length}
            <button className="link-btn small aside" onClick={clearTicked}>Clear</button>
          </div>
          <div className="card list shop-list">{basket.map(row)}</div>
        </section>
      )}

      {mine.length > 0 && <ClearAll items={mine} view={view} />}

      {open && <GroupSheet group={open} onClose={() => setOpen(null)} />}
      {fromCal && <FromCalendarSheet onClose={() => setFromCal(false)} />}
    </>
  );
}

/** Clearing everything, at the foot of the list: needs a press and hold, and can be undone. */
function ClearAll({ items, view }: { items: ShopItem[]; view: Who }) {
  const { settings } = useStore();
  const toBuy = items.filter((i) => !i.checked).length;
  const other: Person | null = view === 'tom' ? 'nuria' : view === 'nuria' ? 'tom' : null;
  // in one person's view, lines that are also on the other person's list
  const shared = other ? items.filter((i) => shows(i, other)).length : 0;
  const whose = view === 'both' ? 'the whole list' : `${settings.names[view]}’s list`;
  const clear = () => {
    const all = [...items];
    store.put(...all.map((i) => ({ ...i, deleted: true })));
    toast(`Cleared ${all.length} item${all.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...all.map((i) => ({ ...i, deleted: false }))) }, 10000);
  };
  return (
    <div className="clear-all">
      <HoldButton className="danger-soft" onDone={clear} holdingLabel="Keep holding to clear…">
        <Icon name="trash" size={18} /> Hold to clear {whose}
      </HoldButton>
      <p className="small-print">
        Removes the {items.length} item{items.length === 1 ? '' : 's'} shown here{toBuy ? `, ${toBuy} not yet ticked` : ''}
        {other && shared ? `. ${shared} of them ${shared === 1 ? 'is' : 'are'} on ${settings.names[other]}’s list too` : ''}
        {other && !shared ? `. ${settings.names[other]}’s items stay` : ''}. You can undo straight afterwards.
      </p>
    </div>
  );
}

/** One line on the list: where each part came from, and who added it. */
function GroupSheet({ group, onClose }: { group: ShopGroup; onClose: () => void }) {
  const { shopping, settings } = useStore();
  // follow live changes (the other phone may tick or delete)
  const items = shopping.filter((i) => group.items.some((g) => g.id === i.id));
  const [name, setName] = useState(group.name);
  const [aisle, setAisle] = useState<Aisle>(group.aisle);

  const save = () => {
    const n = name.trim() || group.name;
    store.put(...items.map((i) => ({ ...i, name: n, aisle })));
    onClose();
  };
  const remove = (list: ShopItem[]) => {
    store.put(...list.map((i) => ({ ...i, deleted: true })));
    toast(`Removed ${list.length === 1 ? list[0].name : `${list.length} items`}`, { label: 'Undo', run: () => store.put(...list.map((i) => ({ ...i, deleted: false }))) });
    if (list.length === items.length) onClose();
  };

  return (
    <Sheet
      title={group.name}
      onClose={onClose}
      footer={
        <div className="btn-row">
          <button className="btn delete" onClick={() => remove(items)} aria-label="Remove from list">
            <Icon name="trash" size={20} />
          </button>
          <button className="btn primary" onClick={save}>Done</button>
        </div>
      }
    >
      <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
        {fmtAmount(items) || 'No amount'} in total{items.length > 1 ? `, from ${items.length} places` : ''}.
      </p>
      <div className="card set-group">
        {items.map((i) => (
          <div key={i.id} className="set-row" style={{ alignItems: 'flex-start' }}>
            <span className={`who-dot ${i.addedBy}`} style={{ marginTop: 7 }} />
            <span className="grow">
              <div style={{ fontWeight: 600 }}>{i.source?.label ?? 'Added by hand'}</div>
              <div className="hint">
                {fmtAmount([i]) || 'no amount'} · added by {settings.names[i.addedBy]}
                {i.source?.forWho ? ` · for ${i.source.forWho === 'both' ? 'both of you' : settings.names[i.source.forWho]}` : ''}
              </div>
            </span>
            {items.length > 1 && (
              <button className="icon-btn small" onClick={() => remove([i])} aria-label="Remove this part">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="gn">Name on the list</label>
        <input id="gn" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ga">Aisle</label>
        <select id="ga" className="input" value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
          {AISLES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
    </Sheet>
  );
}

const fmtDay = (d: string) => fromISO(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function FromCalendarSheet({ onClose }: { onClose: () => void }) {
  const { mealsByDate, shopping, recipes, settings, device } = useStore();
  const view: Who = device.shopView ?? 'both';
  const foods = useFoods();
  const [from, setFrom] = useState(today());
  const [days, setDays] = useState('7');
  const [forWho, setForWho] = useState<Who>(view);
  const n = Math.max(1, Math.min(31, Math.round(Number(days) || 0)));
  const lookup = useMemo(() => ({ recipe: (id: string) => recipes.find((r) => r.id === id), food: foods.get }), [recipes, foods]);
  const plan = useMemo(
    () => (isISODate(from) && foods.ready ? planFromCalendar(mealsByDate, from, n, forWho, shopping, lookup, device.me, newId) : null),
    [mealsByDate, from, n, forWho, shopping, lookup, device.me, foods.ready],
  );

  const [choosing, setChoosing] = useState(false);

  const skipped = plan ? [plan.notes && `${plan.notes} note${plan.notes === 1 ? '' : 's'}`, plan.leftovers && `${plan.leftovers} leftover meal${plan.leftovers === 1 ? '' : 's'}`].filter(Boolean) : [];

  return (
    <Sheet
      title="Add from the calendar"
      onClose={onClose}
      footer={
        <button className="btn primary save" disabled={!plan?.add.length} onClick={() => setChoosing(true)}>
          <span>{plan?.add.length ? 'Next: choose items' : 'Nothing to add'}</span>
          {isISODate(from) && <span className="save-sub">{n === 1 ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(addDays(from, n - 1))}`}</span>}
        </button>
      }
    >
      <div className="inline">
        <div className="field">
          <label htmlFor="cf">From</label>
          <input id="cf" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label htmlFor="cd">Days</label>
          <input id="cd" className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
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
      {plan && (
        <div className="note">
          {plan.meals ? `${plan.meals} meal${plan.meals === 1 ? '' : 's'} to shop for.` : 'No meals with ingredients in those days.'}
          {skipped.length ? ` Skipping ${skipped.join(' and ')} (nothing to buy).` : ''}
          {plan.already ? ` ${plan.already} meal${plan.already === 1 ? ' is' : 's are'} already on the list.` : ''}
        </div>
      )}
      <p className="small-print">Amounts are scaled to who’s eating: a meal for both of you counts twice.</p>
      {choosing && plan && (
        <ChooseItemsSheet
          title="Choose items"
          items={plan.add}
          note={`For ${plan.meals} meal${plan.meals === 1 ? '' : 's'}.`}
          onClose={() => setChoosing(false)}
          onAdded={onClose}
        />
      )}
    </Sheet>
  );
}

/**
 * Before anything goes on the list: everything ticked, untick what's already at home.
 * Lines for the same food show as one, as on the list itself.
 */
export function ChooseItemsSheet({ title, items, note, onClose, onAdded }: { title: string; items: ShopItem[]; note?: string; onClose: () => void; onAdded?: () => void }) {
  const aisles = useMemo(() => groupShopping(items), [items]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const groups = aisles.flatMap((a) => a.groups);
  const chosen = groups.filter((g) => !off.has(g.key));
  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
  };

  const add = () => {
    const list = chosen.flatMap((g) => g.items);
    if (!list.length) return;
    store.put(...list);
    toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => store.put(...list.map((i) => ({ ...i, deleted: true }))) });
    onAdded?.();
    onClose();
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      full
      footer={
        <button className="btn primary" disabled={!chosen.length} onClick={add}>
          {chosen.length ? `Add ${chosen.length} item${chosen.length === 1 ? '' : 's'} to the list` : 'Nothing ticked'}
        </button>
      }
    >
      <p className="text-2" style={{ marginTop: 0, fontSize: 14 }}>
        {note ? `${note} ` : ''}Untick anything you already have at home.
      </p>
      {aisles.map((a) => (
        <section key={a.aisle}>
          <div className="section-title">{a.aisle}</div>
          <div className="card list shop-list">
            {a.groups.map((g) => {
              const on = !off.has(g.key);
              return (
                <button key={g.key} className={`shop-row pick${on ? ' done' : ' skipped'}`} onClick={() => toggle(g.key)} aria-pressed={on}>
                  <span className="tick">{on && <Icon name="check" size={16} stroke={3} />}</span>
                  <span className="shop-main">
                    <span className="shop-line">
                      <span className="shop-name">{g.name}</span>
                      {g.amount && <span className="shop-amt num">{g.amount}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
