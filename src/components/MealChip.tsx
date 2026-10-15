import { mealTitle } from '../lib/plan';
import type { MealBody, Recipe } from '../lib/types';

/** One meal on the calendar or in a menu, tinted for Tom, Nuria or Both. */
export function MealChip({ meal, recipe, onClick, kcal }: { meal: MealBody; recipe: (id: string) => Recipe | undefined; onClick: () => void; kcal?: string }) {
  const c = meal.content;
  return (
    <button className={`meal-chip ${meal.who}`} onClick={onClick}>
      {meal.leftovers && (
        <span className="meal-tags">
          <span className="meal-label">Leftovers</span>
        </span>
      )}
      <span className={`meal-title${c.type === 'items' ? ' items' : ''}`}>{mealTitle(meal, recipe)}</span>
      {kcal && <span className="meal-kcal">{kcal}</span>}
    </button>
  );
}
