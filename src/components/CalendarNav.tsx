import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { addDays, fromISO } from '../lib/dates';
import { daysFrom, weekStart } from '../lib/plan';

/** Whole days from a to b. */
export const dayDiff = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);

/**
 * Swipe sideways to go back or forward, like a carousel: the day (or week) either side sits just
 * off screen and follows the finger in. Let go past a third of the way (or with a quick flick)
 * and it carries on to the next one. Only sideways movement counts, so scrolling up and down
 * still works, and touches that start right at the screen edge are left alone for the phone's own
 * back gesture. `panel(-1 | 0 | 1)` draws the one before, the current one and the one after.
 */
export function Swipeable({ onPrev, onNext, panel, head }: {
  onPrev: () => void;
  onNext: () => void;
  panel: (offset: -1 | 0 | 1) => { key: string; node: ReactNode };
  head?: ReactNode;
}) {
  const view = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const g = useRef({ id: -1, x: 0, y: 0, t: 0, horizontal: null as boolean | null, moved: false });
  const width = () => view.current?.offsetWidth ?? 390;

  const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => setDragging(false)));

  /** Slide the rest of the way, then make the neighbour the current one without anything moving. */
  const finish = (forward: boolean) => {
    busy.current = true;
    setDragging(false);
    setDx(forward ? -width() : width());
    window.setTimeout(() => {
      setDragging(true);
      (forward ? onNext : onPrev)();
      setDx(0);
      settle();
      busy.current = false;
    }, 230);
  };

  return (
    <div
      className="swipeable"
      onPointerDown={(e) => {
        if (busy.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const edge = 24;
        if (e.clientX < edge || e.clientX > window.innerWidth - edge) return;
        g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), horizontal: null, moved: false };
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (s.id !== e.pointerId) return;
        const mx = e.clientX - s.x;
        const my = e.clientY - s.y;
        if (s.horizontal === null && Math.hypot(mx, my) > 10) {
          s.horizontal = Math.abs(mx) > Math.abs(my) * 1.4;
          if (s.horizontal) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDragging(true);
          } else s.id = -1; // scrolling up or down: not a swipe
        }
        if (s.horizontal) {
          s.moved = true;
          setDx(mx);
        }
      }}
      onPointerUp={(e) => {
        const s = g.current;
        if (s.id !== e.pointerId) return;
        s.id = -1;
        if (!s.horizontal) return;
        const mx = e.clientX - s.x;
        const fast = Math.abs(mx) > 40 && Date.now() - s.t < 250;
        if (Math.abs(mx) > width() / 3 || fast) return finish(mx < 0);
        setDragging(false);
        setDx(0);
      }}
      onPointerCancel={() => {
        g.current.id = -1;
        setDragging(false);
        setDx(0);
      }}
      // a swipe that started on a meal shouldn't also open it
      onClickCapture={(e) => {
        if (g.current.moved) {
          e.stopPropagation();
          e.preventDefault();
          g.current.moved = false;
        }
      }}
    >
      {head}
      <div className="swipe-view" ref={view}>
        <div className={`swipe-track${dragging ? ' dragging' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>
          {([-1, 0, 1] as const).map((o) => {
            const p = panel(o);
            return (
              <div key={p.key} className={`swipe-panel${o ? (o < 0 ? ' side prev' : ' side next') : ''}`} aria-hidden={o ? true : undefined} inert={o ? true : undefined}>
                {p.node}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SHORT = (d: string) => fromISO(d).toLocaleDateString('en-GB', { weekday: 'short' }).replace(/[.,]/g, '');
const MONTH = (d: string) => fromISO(d).toLocaleDateString('en-GB', { month: 'short' }).replace(/[.,]/g, '');

/**
 * The row of dates: scrolls sideways forever, a week to a screen, snapping to days. More days
 * are added at either end as you get near it. Tapping a date picks it; when the picked date
 * moves off screen (swiping the day, the Today button) the row follows.
 */
export function DateStrip({ selected, today, onPick, hasMeals }: { selected: string; today: string; onPick: (d: string) => void; hasMeals: (d: string) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(() => addDays(weekStart(selected), -28));
  const [count, setCount] = useState(7 * 9);
  const shift = useRef(0); // days added at the start, to keep the view still
  const days = daysFrom(from, count);
  const width = () => (ref.current?.clientWidth ?? 350) / 7;

  // keep what's on screen in place when days are added in front
  useLayoutEffect(() => {
    if (shift.current && ref.current) {
      ref.current.scrollLeft += shift.current * width();
      shift.current = 0;
    }
  }, [from]);

  // bring the picked day into view (showing its whole week) when it's off screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = from;
    if (selected < from || selected >= addDays(from, count)) {
      start = addDays(weekStart(selected), -28);
      setFrom(start);
      setCount(7 * 9);
    }
    const w = width();
    const i = dayDiff(start, selected);
    const first = Math.round(el.scrollLeft / w);
    if (i < first || i > first + 6 || start !== from) {
      requestAnimationFrame(() => el.scrollTo({ left: dayDiff(start, weekStart(selected)) * w, behavior: start !== from ? 'auto' : 'smooth' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // first time: start on the picked day's week
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = dayDiff(from, weekStart(selected)) * width();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = width();
    if (el.scrollLeft < 7 * w) {
      shift.current += 28;
      setFrom((f) => addDays(f, -28));
      setCount((c) => c + 28);
    } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - 7 * w) {
      setCount((c) => c + 28);
    }
  };

  return (
    <div className="date-strip" ref={ref} onScroll={onScroll} role="tablist" aria-label="Dates">
      {days.map((d) => {
        const first = fromISO(d).getDate() === 1;
        return (
          <button
            key={d}
            role="tab"
            aria-selected={d === selected}
            className={`date-pill${d === selected ? ' on' : ''}${d === today ? ' today' : ''}${d < today ? ' past' : ''}${first ? ' first' : ''}`}
            onClick={() => onPick(d)}
          >
            <span className="dp-day">{d === today ? 'Today' : first ? MONTH(d) : SHORT(d)}</span>
            <span className="dp-num">{fromISO(d).getDate()}</span>
            <span className={`dp-dot${hasMeals(d) ? ' has' : ''}`} />
          </button>
        );
      })}
    </div>
  );
}
