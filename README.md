# Meal Planner

Recipes, meals and shopping for Tom and Nuria, built like [Billsplit](https://github.com/tmgh11/billsplit): one small web app that installs on both phones, works offline, and keeps the two phones in sync through a free Supabase database.

**What it does so far**

- **Calendar:** a week at a time, with breakfast, lunch, snacks and dinner. Every meal is for Tom, Nuria or Both: the Tom / Nuria / Both switch shows one person, or both side by side with shared meals spanning the width. A meal can be a saved recipe (with each person's portion in servings or grams of the cooked dish), a list of weighed items ("120g chicken, 100g broccoli…"), or just a note ("Pizza night"). Labels like "Legume Day" and a Leftovers marker are kept. If someone tracks nutrition, each day shows their total against their target.
- **Menus:** a run of days (Day 1, Day 2…) you can drop onto the calendar from any date for any number of days. A short menu repeats, a long one is cut. Choose who it's for, and whether to keep or replace meals already planned (with Undo). Save any stretch of the calendar as a new menu.
- **Import a spreadsheet:** Menus → Import spreadsheet reads an .xlsx laid out like Nuria's (Breakfast / Lunch / Snacks / Dinner columns, a row per day) and makes a menu per sheet. Amounts are matched to foods; the spreadsheet's own calorie numbers are not copied.
- **Recipes:** ingredients in grams, marked Tom's, Nuria's or ours. Paste ingredients one per line, or Nuria-style comma lists. Each line is matched to a food and turned into grams; "4 cloves" or "1 tin" use a typical weight, and the app says when it has.
- **UK food data:** 2,886 foods from the government's CoFID 2021 dataset, with separate raw, dried and cooked entries. The app prefers raw and flags foods where raw versus cooked matters (pasta, rice, lentils, meat).
- **Your own values win:** correct any food's values (e.g. from a packet label) or add foods the UK data lacks (gluten-free bread, oat milk). The original values are kept, and you can reset.
- **Nutrition is opt-in per person:** nobody sees numbers unless they switch tracking on in Settings.

Coming next: the joint shopping list and the recipe browser.

---

## 1. Set up Supabase (about 5 minutes, free)

Use a **new** project, separate from Billsplit's.

1. At [supabase.com](https://supabase.com), create a **New project** called `mealplanner`. Choose the London region (`eu-west-2`). Leave **Enable Data API** ticked, untick **Automatically expose new tables**, and tick **Enable automatic RLS**.
2. Go to **SQL Editor → New query** and paste in the whole of [`supabase/schema.sql`](supabase/schema.sql). **Replace the two example emails at the bottom with your real ones**, then press **Run**.
3. Go to **Authentication → Users → Add user → Create new user**. Add Tom's email and a password, and tick **Auto Confirm User**. Repeat for Nuria.
4. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
5. Copy the **Project URL** (`https://<project-ref>.supabase.co`) and the **publishable key** (`sb_publishable_…`) from the **Connect** button. The key is designed to be public: row-level security means only your two signed-in accounts can read or write anything.

> Free Supabase projects pause after about a week with no activity. If that happens, press **Resume project** in the dashboard. The app keeps working offline on each phone in the meantime and syncs once the project is back.

## 2. Put it online (Cloudflare, free)

The app lives at **https://mealplanner.tom1609.workers.dev**, its own address, so it never clashes with Billsplit on the phones.

- Cloudflare is connected to this GitHub repo: every push to `main` rebuilds and redeploys automatically (Cloudflare dashboard → Workers & Pages → mealplanner → Deployments).
- Build command `npm run build`, deploy command `npx wrangler deploy`; `wrangler.jsonc` tells Cloudflare to serve the `dist` folder.
- Build variables (set in Cloudflare): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=22`.

(The GitHub Pages copy at tmgh11.github.io/mealplanner/ is no longer used: Chrome on Android confused it with Billsplit, which shares that address.)

## 3. Install on your phones

- **iPhone (Safari):** open the site, then tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the site, then tap **⋮ → Install app**.

Open **https://mealplanner.tom1609.workers.dev** to install. On first open, pick whose phone it is. Then sign in under **Settings → Sync between phones** with that person's email and password.

---

## Develop locally

```bash
npm install
npm run dev      # also opens on your network – visit the "Network" URL from your phone
npm test         # ingredient reading, food matching, nutrition maths, menus, spreadsheet import
npm run build
```

Without Supabase configured, the app runs in local-only mode, with data kept in that browser.

### Project layout

```
src/lib/            plain TypeScript logic (unit-tested in lib.test.ts)
  parse.ts          reading ingredient lines and Nuria-style comma lists
  foods.ts          CoFID + our edits, typical portion weights, matching text to foods
  nutrition.ts      grams from any unit, totals, per serving / per cooked weight
  ingredients.ts    line → matched, weighed ingredient, and what to flag
  plan.ts           weeks, meal nutrition per person, menus → calendar, calendar → menu
  xlsx.ts           reading .xlsx files in the browser
  importSheet.ts    spreadsheet sheets → menus
  store.ts          local-first store with change queue (from Billsplit)
  persist.ts        phone storage (IndexedDB)
  sync.ts           Supabase push/pull + realtime, last-write-wins (from Billsplit)
src/components/     screens and sheets (React)
public/data/cofid.json  the UK food data, built by scripts/cofid.py
supabase/schema.sql one table + row-level security + photo storage
```

### Updating the food data

`public/data/cofid.json` is generated from the government spreadsheet:

```bash
pip install openpyxl
python3 scripts/cofid.py McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx
```

Food values: McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, Public Health England. Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
