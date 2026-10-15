import { Seg } from './ui';
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
