#!/usr/bin/env python3
"""Consistency audit of recipes (read-only; used by the recipe-importer agent, .claude/agents/recipe-importer.md).

Usage: python tools/audit_recipes.py [--existing SRC] [--new SRC] [--json]
  --existing  the recipes already in the app: a data folder (default public/data) or the site's export file
  --new       recipes about to be imported (e.g. inbox/, with <slug>/recipe.json); optional

Reports, most severe first:
  ERROR  missing title/servings/ingredients/steps, unreadable "??" text, a title that already exists, spoon units
         other than tbs (1 cucchiaino = 1/3 tbs), bookkeeping in taken_from
  WARN   units outside the usual vocabulary, the same ingredient spelt differently (case, accents, plural: these split the shopping list),
         the same ingredient in different units (the list cannot add them up)
  NOTE   ingredient names used by no other recipe (check the spelling), with the closest existing name
Each line says which recipe and file, and the suggested fix (the spelling most recipes already use).
"""
import argparse
import difflib
import json
import re
import sys
from collections import defaultdict

from calderone_io import ROOT, UNITS, clean_name, fold, load_recipes, stem

SPOONS = {"cucchiaino", "cucchiaini", "cucchiaio", "cucchiai", "cc", "cucchiaio raso"}


def short(path: str) -> str:
    """A path relative to the repo when possible (shorter report lines)."""
    from pathlib import Path
    p = Path(path).resolve()
    return str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)


def audit(existing: list[dict], new: list[dict]) -> list[tuple[str, str]]:
    out = []
    every = [(r, False) for r in existing] + [(r, True) for r in new]
    label = lambda r, is_new: f"{'NEW ' if is_new else ''}«{r.get('title', '?')}» ({short(r['_file'])})"

    # recipe-level checks
    titles = defaultdict(list)
    for r, is_new in every:
        titles[fold(r.get("title", "")).strip()].append((r, is_new))
        for k in ("title", "servings", "ingredients", "steps"):
            if not r.get(k):
                out.append(("ERROR", f"{label(r, is_new)}: missing {k}"))
        if "??" in json.dumps(r, ensure_ascii=False):
            out.append(("ERROR", f"{label(r, is_new)}: contains '??' (unreadable text to check by hand)"))
        if re.search(r"IMG_|\.xlsx|screenshot", str(r.get("taken_from") or ""), re.I):
            out.append(("ERROR", f"{label(r, is_new)}: taken_from holds bookkeeping ({r['taken_from']!r}); leave it empty"))
        for i in r.get("ingredients", []):
            u = (i.get("unit") or "").strip()
            if u and u not in UNITS:
                if fold(u) in SPOONS:
                    out.append(("ERROR", f"{label(r, is_new)}: «{i['name']}» unit {u!r}: spoons are tbs (1 cucchiaino = 1/3 tbs)"))
                else:
                    out.append(("WARN", f"{label(r, is_new)}: «{i['name']}» unit {u!r} is unusual (usual: {', '.join(sorted(UNITS))})"))
    for key, rs in titles.items():
        if key and len(rs) > 1 and any(n for _, n in rs):
            out.append(("ERROR", "same title: " + "; ".join(label(r, n) for r, n in rs)))

    # ingredient spelling and units across all recipes
    spell = defaultdict(lambda: defaultdict(list))   # stem -> exact name -> [labels]
    units = defaultdict(lambda: defaultdict(list))   # stem -> unit -> [labels]
    for r, is_new in every:
        for i in r.get("ingredients", []):
            k = stem(i["name"])
            spell[k][i["name"].strip()].append(label(r, is_new))
            if (i.get("unit") or "q.b.") != "q.b.":
                units[k][i["unit"]].append(label(r, is_new))
    for k, names in spell.items():
        if len(names) > 1:
            best = max(names, key=lambda n: len(names[n]))
            others = "; ".join(f"«{n}» in {', '.join(names[n])}" for n in names if n != best)
            out.append(("WARN", f"same ingredient, different spelling: use «{best}» ({len(names[best])} recipes) instead of {others}"))
    for k, us in units.items():
        if len(us) > 1:
            name = max(spell[k], key=lambda n: len(spell[k][n]))
            out.append(("WARN", f"«{name}» in different units: " + "; ".join(f"{u} in {', '.join(v)}" for u, v in us.items())))

    # new names nobody else uses
    if new:
        old_names = {clean_name(i["name"]): i["name"] for r in existing for i in r.get("ingredients", [])}
        old_stems = {stem(n) for n in old_names}
        for r in new:
            for i in r.get("ingredients", []):
                if stem(i["name"]) not in old_stems and len(spell[stem(i["name"])]) == 1:
                    close = difflib.get_close_matches(clean_name(i["name"]), list(old_names), n=1, cutoff=0.75)
                    hint = f"; closest existing: «{old_names[close[0]]}»" if close else ""
                    out.append(("NOTE", f"{label(r, True)}: new ingredient «{i['name']}»{hint}"))
    order = {"ERROR": 0, "WARN": 1, "NOTE": 2}
    return sorted(out, key=lambda x: order[x[0]])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--existing", default=str(ROOT / "public" / "data"))
    ap.add_argument("--new")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    existing = load_recipes(a.existing)
    new = load_recipes(a.new) if a.new else []
    res = audit(existing, new)
    if a.json:
        print(json.dumps([{"level": l, "text": t} for l, t in res], ensure_ascii=False, indent=2))
    else:
        print(f"{len(existing)} existing and {len(new)} new recipes")
        for level, text in res:
            print(level, text)
        print("OK" if not any(l != "NOTE" for l, _ in res) else
              f"{sum(l == 'ERROR' for l, _ in res)} error(s), {sum(l == 'WARN' for l, _ in res)} warning(s)")
    return 1 if any(l == "ERROR" for l, _ in res) else 0


if __name__ == "__main__":
    sys.exit(main())
