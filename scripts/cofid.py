"""Convert the CoFID 2021 spreadsheet into the compact food list the app bundles.

Run once (needs `pip install openpyxl`):
    python3 scripts/cofid.py path/to/McCance_Widdowsons_..._2021..xlsx

Writes public/data/cofid.json: {"version", "source", "foods": [[code, name, group, kcal, protein,
carbs, fat, fibre, sugars, salt], ...]}. Values are per 100 g of food as described by its name
(e.g. "dried, raw" vs "boiled in unsalted water"). "Tr" (trace) becomes 0; "N" (present but not
measured) and blanks become null.
"""
import json
import sys

import openpyxl

src = sys.argv[1]
wb = openpyxl.load_workbook(src, read_only=True)


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "N"):
        return None
    if s == "Tr":
        return 0
    try:
        return float(s)
    except ValueError:
        return None


def rows(sheet):
    out = {}
    header = None
    for i, r in enumerate(wb[sheet].iter_rows(values_only=True)):
        if i == 0:
            header = [str(c).strip() if c else "" for c in r]
            continue
        if not r[0] or not str(r[0])[0].isdigit():
            continue  # the two description rows under the header
        out[str(r[0]).strip()] = dict(zip(header, r))
    return out


prox = rows("1.3 Proximates")
inorg = rows("1.4 Inorganics")

GROUPS = {
    "A": "Cereals", "B": "Dairy", "C": "Eggs", "D": "Vegetables", "F": "Fruit", "G": "Nuts and seeds",
    "H": "Herbs and spices", "J": "Fish", "M": "Meat and poultry", "O": "Fats and oils", "P": "Drinks",
    "Q": "Alcohol", "S": "Sweets and snacks", "W": "Soups, sauces and misc",
}


def r1(x):
    return None if x is None else round(x, 1)


foods = []
for code, p in prox.items():
    sodium = num(inorg.get(code, {}).get("Sodium (mg)"))
    salt = None if sodium is None else round(sodium * 2.5 / 1000, 2)  # g salt per 100 g
    foods.append([
        code,
        str(p["Food Name"]).strip(),
        GROUPS.get(str(p["Group"])[0], "Other"),
        r1(num(p["Energy (kcal) (kcal)"])),
        r1(num(p["Protein (g)"])),
        r1(num(p["Carbohydrate (g)"])),
        r1(num(p["Fat (g)"])),
        r1(num(p["AOAC fibre (g)"])),
        r1(num(p["Total sugars (g)"])),
        salt,
    ])

foods.sort(key=lambda f: f[1].lower())
out = {
    "version": "CoFID 2021",
    "source": "McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, Public Health England. Open Government Licence v3.0.",
    "foods": foods,
}
with open("public/data/cofid.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(foods)} foods written")
