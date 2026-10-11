/** The food list for screens: CoFID (loaded once, then cached offline) with our edits laid over it. */
import { useEffect, useMemo, useState } from 'react';
import { buildFoods, type CofidRow } from './foods';
import { useStore } from './store';
import type { Food } from './types';

let rows: CofidRow[] | null = null;
let loading: Promise<CofidRow[]> | null = null;

export function loadCofid(): Promise<CofidRow[]> {
  if (rows) return Promise.resolve(rows);
  loading ??= fetch('./data/cofid.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Food list: ${r.status}`);
      return r.json() as Promise<{ foods: CofidRow[] }>;
    })
    .then((d) => (rows = d.foods))
    .catch((e) => {
      loading = null; // try again next time
      throw e;
    });
  return loading;
}

export interface FoodList {
  ready: boolean;
  error?: string;
  foods: Food[];
  byId: Map<string, Food>;
  get: (id: string) => Food | undefined;
}

export function useFoods(): FoodList {
  const { foodEntries } = useStore();
  const [base, setBase] = useState<CofidRow[] | null>(rows);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (base) return;
    loadCofid().then(setBase, (e: Error) => setError(e.message));
  }, [base]);
  return useMemo(() => {
    const foods = buildFoods(base ?? [], foodEntries);
    const byId = new Map(foods.map((f) => [f.id, f]));
    return { ready: Boolean(base), error, foods, byId, get: (id: string) => byId.get(id) };
  }, [base, foodEntries, error]);
}
