import { useState } from 'react';
import { CalendarView } from './components/CalendarView';
import { MenusView } from './components/MenusView';
import { RecipesView } from './components/RecipesView';
import { ShoppingView } from './components/ShoppingView';
import { FoodsView } from './components/FoodsView';
import { SettingsView } from './components/SettingsView';
import { Icon, ToastHost } from './components/ui';
import { store, useStore } from './lib/store';

type Tab = 'calendar' | 'shopping' | 'recipes' | 'menus' | 'foods' | 'settings';

const TITLES: Record<Tab, string> = { calendar: 'Calendar', shopping: 'Shopping list', recipes: 'Recipes', menus: 'Menus', foods: 'Foods', settings: 'Settings' };

export default function App() {
  const { sync, device, settings, loaded } = useStore();
  const [tab, setTab] = useState<Tab>('calendar');

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const dot = sync.state === 'synced' ? 'ok' : sync.state === 'syncing' ? 'busy' : sync.state === 'error' ? 'bad' : sync.state === 'offline' ? 'warn' : '';
  const pill = { local: 'On this phone', 'signed-out': 'Signed out', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error' }[sync.state];

  if (!loaded) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', minHeight: '80dvh' }}>
        <img src="icons/icon-192.png" alt="" style={{ width: 64, height: 64, borderRadius: 18, opacity: 0.9 }} />
      </div>
    );
  }

  if (!device.onboarded) {
    return (
      <div className="app">
        <div className="welcome">
          <img className="logo" src="icons/icon-192.png" alt="" />
          <h2>Welcome to Meal Planner</h2>
          <p className="text-2">Whose phone is this?</p>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {(['tom', 'nuria'] as const).map((p) => (
            <button key={p} className="btn" style={{ minHeight: 64, fontSize: 18 }} onClick={() => store.setDevice({ me: p, view: p, onboarded: true })}>
              <span className={p}>I’m {settings.names[p]}</span>
            </button>
          ))}
        </div>
        <p className="small-print" style={{ textAlign: 'center', marginTop: 18 }}>You can change this later in Settings.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLES[tab]}</h1>
        <span className="top-actions">
          <button className="sync-pill" onClick={() => go('settings')} aria-label={`Sync status: ${pill}`}>
            <span className={`dot ${dot}`} />
            {pill}
          </button>
          <button className={`icon-btn top-settings${tab === 'settings' ? ' on' : ''}`} onClick={() => go('settings')} aria-label="Settings">
            <Icon name="settings" size={20} />
          </button>
        </span>
      </header>

      <main>
        {tab === 'calendar' && <CalendarView />}
        {tab === 'shopping' && <ShoppingView />}
        {tab === 'recipes' && <RecipesView />}
        {tab === 'menus' && <MenusView />}
        {tab === 'foods' && <FoodsView />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <TabBtn active={tab === 'calendar'} onClick={() => go('calendar')} icon="calendar" label="Calendar" />
          <TabBtn active={tab === 'shopping'} onClick={() => go('shopping')} icon="cart" label="Shopping" />
          <TabBtn active={tab === 'recipes'} onClick={() => go('recipes')} icon="book" label="Recipes" />
          <TabBtn active={tab === 'menus'} onClick={() => go('menus')} icon="list" label="Menus" />
          <TabBtn active={tab === 'foods'} onClick={() => go('foods')} icon="leaf" label="Foods" />
        </div>
      </nav>
      <ToastHost />
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: 'book' | 'leaf' | 'list' | 'calendar' | 'cart'; label: string }) {
  return (
    <button className={`tab${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={22} />
      {label}
    </button>
  );
}
