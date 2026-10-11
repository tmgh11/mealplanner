import { useState } from 'react';
import { Seg } from './ui';
import { fmtG, fmtKcal, scale, type Totals } from '../lib/nutrition';
import type { Nutrients } from '../lib/types';

/** kcal · protein · carbs · fat as four tiles. */
export function Macros({ n, small }: { n: Nutrients; small?: boolean }) {
  return (
    <div className={`macros${small ? ' small' : ''}`}>
      <div><strong className="num">{fmtKcal(n.kcal)}</strong><span>kcal</span></div>
      <div><strong className="num">{fmtG(n.protein)}</strong><span>protein g</span></div>
      <div><strong className="num">{fmtG(n.carbs)}</strong><span>carbs g</span></div>
      <div><strong className="num">{fmtG(n.fat)}</strong><span>fat g</span></div>
    </div>
  );
}

const LABEL: Record<string, string> = { kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat', fibre: 'fibre', sugars: 'sugars', salt: 'salt' };

export function NutritionSummary({ totals, servings, per100Cooked }: { totals: Totals; servings: number; per100Cooked: number | null }) {
  const [mode, setMode] = useState<'serving' | 'total'>('serving');
  const n = mode === 'serving' ? scale(totals.sum, 1 / Math.max(1, servings || 1)) : totals.sum;
  const gaps = totals.gaps.filter((k) => ['kcal', 'protein', 'carbs', 'fat'].includes(k));
  return (
    <div className="card pad nutri">
      <div className="nutri-head">
        <strong>Nutrition</strong>
        <div style={{ width: 190 }}>
          <Seg<'serving' | 'total'> value={mode} onChange={setMode} options={[{ value: 'serving', label: 'Serving' }, { value: 'total', label: 'Whole' }]} />
        </div>
      </div>
      <Macros n={n} />
      <p className="small-print" style={{ margin: '10px 2px 0' }}>
        {mode === 'serving' ? `1 of ${servings || 1} servings` : `${Math.round(totals.grams)} g of ingredients`}
        {per100Cooked != null && ` · ${Math.round(per100Cooked)} kcal per 100 g cooked`}
        {totals.missing.length > 0 && ` · ${totals.missing.length} ingredient${totals.missing.length === 1 ? '' : 's'} not counted yet`}
        {gaps.length > 0 && ` · UK data has no ${gaps.map((k) => LABEL[k]).join('/')} value for some foods`}
      </p>
    </div>
  );
}
