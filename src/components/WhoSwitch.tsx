import { useEffect, useRef, useState } from 'react';
import { Icon, Seg } from './ui';
import { store, useStore } from '../lib/store';
import type { Who } from '../lib/types';

/** Tom / Nuria / Both: what this phone is looking at. Remembered per phone. */
export function useView(): Who {
  const { device } = useStore();
  return device.view ?? device.me;
}

export function WhoSwitch({ value, onChange }: { value?: Who; onChange?: (v: Who) => void } = {}) {
  const { settings } = useStore();
  const view = useView();
  return (
    <Seg<Who>
      value={value ?? view}
      onChange={onChange ?? ((v) => store.setDevice({ view: v }))}
      options={[
        { value: 'tom', label: settings.names.tom, className: 'tom' },
        { value: 'nuria', label: settings.names.nuria, className: 'nuria' },
        { value: 'both', label: 'Both' },
      ]}
    />
  );
}

/** A small coloured tag: Tom, Nuria or Both. */
export function WhoTag({ who }: { who: Who }) {
  const { settings } = useStore();
  const label = who === 'both' ? 'Both' : settings.names[who];
  return <span className={`who-tag ${who}`}>{label}</span>;
}

/**
 * The compact person filter for the top bar: "T N" (both), "T" or "N", opening a short menu.
 * Shown on every page that has people's things in it.
 */
export function PersonFilter({ value, onChange }: { value: Who; onChange: (v: Who) => void }) {
  const { settings } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const label = value === 'both' ? 'both of you' : settings.names[value];
  const choose = (v: Who) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="more person-filter" ref={ref}>
      <button className="pf-btn" onClick={() => setOpen((x) => !x)} aria-haspopup="menu" aria-expanded={open} aria-label={`Showing ${label}. Change`}>
        {value !== 'nuria' && <span className="pf-dot tom">{settings.names.tom[0]}</span>}
        {value !== 'tom' && <span className={`pf-dot nuria${value === 'both' ? ' overlap' : ''}`}>{settings.names.nuria[0]}</span>}
        <Icon name="chevron" size={14} stroke={2.6} />
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {(['tom', 'nuria', 'both'] as Who[]).map((v) => (
            <button key={v} role="menuitemradio" aria-checked={value === v} onClick={() => choose(v)}>
              <span className={`pf-dot ${v === 'both' ? 'both' : v}`}>{v === 'both' ? '' : settings.names[v][0]}</span>
              <span style={{ flex: 1 }}>{v === 'both' ? 'Both of us' : settings.names[v]}</span>
              {value === v && <Icon name="check" size={18} stroke={2.6} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
