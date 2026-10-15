import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isISODate } from '../lib/dates';

type IconName =
  | 'plus' | 'camera' | 'arrows' | 'repeat' | 'chart' | 'list' | 'settings' | 'close' | 'trash' | 'check'
  | 'left' | 'right' | 'search' | 'swap' | 'upload' | 'download' | 'pause' | 'play' | 'cloud'
  | 'book' | 'leaf' | 'edit' | 'link' | 'alert' | 'scale' | 'calendar' | 'cart' | 'globe' | 'more' | 'grip' | 'up' | 'down' | 'heading';

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.2} />,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3.2} />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  heading: <path d="M6 5v14M18 5v14M6 12h12" />,
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  arrows: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
  repeat: <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  swap: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  cloud: <path d="M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" />,
  book: <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6" />,
  leaf: <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </>
  ),
  scale: <path d="M5 8h14l-2 12H7zM9 8V6a3 3 0 0 1 6 0v2M12 12v3" />,
};

export function Icon({ name, size = 22, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

let openSheets = 0;

export function Sheet({
  title,
  onClose,
  children,
  footer,
  full,
  headerAction,
  dirty,
  discardPrompt = 'Discard your changes?',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  /** an extra button shown in the header, before the close button */
  headerAction?: ReactNode;
  /** something has been entered: closing (other than by saving) asks before throwing it away */
  dirty?: boolean;
  discardPrompt?: string;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  // Closing with ×, the backdrop, Escape or a swipe. Kept in a ref so the listeners below always
  // see the latest `dirty` without being re-attached.
  const requestClose = useRef(() => {});
  requestClose.current = () => (dirty ? setConfirming(true) : onClose());

  useEffect(() => {
    // the page behind stops scrolling while any sheet is open. Counted, not remembered: sheets
    // can open on top of each other and close in any order, and the page must scroll again
    // once the last one has gone.
    openSheets++;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose.current();
    window.addEventListener('keydown', onKey);

    // iPhone Safari doesn't shrink the page when the keyboard opens – it slides the whole page
    // up instead, which can push the top of a tall sheet off-screen. Pin the sheet to the part
    // of the screen that's actually visible (the "visual viewport") so it sits above the keyboard.
    const vv = window.visualViewport;
    const layer = layerRef.current;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!vv || !layer) return;
        layer.style.top = `${vv.offsetTop}px`;
        layer.style.height = `${vv.height}px`;
        const keyboardOpen = window.innerHeight - vv.height > 120;
        layer.classList.toggle('kb', keyboardOpen);
        // keep whatever is being typed into in view
        const active = document.activeElement as HTMLElement | null;
        if (keyboardOpen && active && layer.contains(active)) active.scrollIntoView({ block: 'nearest' });
      });
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      openSheets = Math.max(0, openSheets - 1);
      if (!openSheets) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Swipe down to close, from the header or from content that's scrolled to the top – the
  // close button is in the hardest corner to reach one-handed.
  useEffect(() => {
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    if (!sheet || !body) return;
    let tracking = false;
    let dragging = false;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      // leave controls alone, and content that's scrolled down scrolls as normal
      if (t.closest('input, select, textarea') || (body.contains(t) && body.scrollTop > 0)) return;
      tracking = true;
      dragging = false;
      startY = e.touches[0].clientY;
      startT = e.timeStamp;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dy < -4) tracking = false; // scrolling up: not a swipe
        if (dy < 8) return;
        dragging = true;
        sheet.style.transition = 'none';
      }
      e.preventDefault(); // the sheet follows the finger instead of the content scrolling
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const fast = dy / Math.max(1, e.timeStamp - startT) > 0.6;
      sheet.style.transition = 'transform 0.2s ease';
      sheet.style.transform = '';
      if (dy > 120 || (fast && dy > 40)) requestClose.current();
    };
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const discard = (
    <div role="alertdialog" aria-labelledby="discard-q">
      <p id="discard-q" className="discard-q">{discardPrompt}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setConfirming(false)}>
          Keep editing
        </button>
        <button type="button" className="btn discard" onClick={onClose}>
          Discard
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={() => requestClose.current()} />
      <div className="sheet-layer" ref={layerRef}>
        <div className={`sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" ref={sheetRef}>
          <div className="sheet-head">
            <h2>{title}</h2>
            {headerAction}
            <button className="icon-btn" onClick={() => requestClose.current()} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="sheet-body" ref={bodyRef}>
            {children}
          </div>
          {(confirming || footer) && <div className="sheet-foot">{confirming ? discard : footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}

let primer: HTMLInputElement | null = null;

/**
 * iPhone Safari only raises the keyboard for an input focused during the tap itself, and a
 * sheet's amount box appears a moment after. Call this in the tap that opens such a sheet: an
 * invisible input takes the focus straight away so the keyboard starts opening, then the sheet's
 * own field (autoFocus) takes the focus, and the keyboard, over. The sheet sits above the
 * keyboard (see Sheet), so the amount stays in view.
 */
export function primeKeyboard() {
  if (!primer) {
    primer = document.createElement('input');
    primer.setAttribute('inputmode', 'decimal');
    primer.setAttribute('aria-hidden', 'true');
    primer.tabIndex = -1;
    primer.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none';
    document.body.appendChild(primer);
  }
  primer.focus({ preventScroll: true });
  // never leave the keyboard typing into an invisible box if nothing takes over
  const p = primer;
  window.setTimeout(() => document.activeElement === p && p.blur(), 600);
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  tall,
}: {
  value: T;
  options: { value: T; label: ReactNode; sub?: ReactNode; className?: string }[];
  onChange: (v: T) => void;
  tall?: boolean;
}) {
  return (
    <div className={`seg${tall ? ' tall' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${value === o.value ? 'on' : ''} ${o.className ?? ''}`}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

// --- lightweight toast ---
let pushToast: ((t: ToastMsg) => void) | null = null;
interface ToastMsg {
  text: string;
  action?: { label: string; run: () => void };
  ms?: number;
}
export function toast(text: string, action?: ToastMsg['action'], ms?: number) {
  pushToast?.({ text, action, ms });
}
export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), m.ms ?? (m.action ? 5000 : 2400));
    };
    return () => {
      pushToast = null;
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <span>{msg.text}</span>
      {msg.action && (
        <button
          onClick={() => {
            msg.action!.run();
            setMsg(null);
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}

/** Shown under a date input left empty (iOS's date picker has a Reset button). */
export function DateHint({ value }: { value: string }) {
  if (isISODate(value)) return null;
  return (
    <p className="small-print" style={{ color: 'var(--danger)' }} role="alert">
      Pick a date
    </p>
  );
}

export function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not supported (iOS) */
  }
}

/**
 * A button that only fires after being pressed and held (for things that are hard to undo by
 * accident, like clearing the whole shopping list). A bar fills while it's held.
 */
export function HoldButton({ ms = 1500, onDone, children, className = '', holdingLabel }: { ms?: number; onDone: () => void; children: ReactNode; className?: string; holdingLabel?: ReactNode }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const startY = useRef(0);
  const start = (y = 0) => {
    startY.current = y;
    setHolding(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      haptic();
      onDone();
    }, ms);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`btn hold-btn ${className}${holding ? ' holding' : ''}`}
      style={{ ['--hold-ms' as string]: `${ms}ms` }}
      onPointerDown={(e) => start(e.clientY)}
      // a finger that moves is scrolling the page, not holding
      onPointerMove={(e) => holding && Math.abs(e.clientY - startY.current) > 10 && stop()}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
      onKeyUp={stop}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{holding && holdingLabel ? holdingLabel : children}</span>
    </button>
  );
}

/** A "⋯" button that opens a short list of actions. */
export function MoreMenu({ items, label = 'More', small }: { items: { label: string; icon?: IconName; danger?: boolean; run: () => void }[]; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div className="more" ref={ref}>
      <button className={small ? 'icon-btn small' : 'icon-btn head-action'} onClick={() => setOpen((x) => !x)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="more" size={small ? 18 : 20} />
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'danger' : undefined}
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              {it.icon && <Icon name={it.icon} size={18} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
