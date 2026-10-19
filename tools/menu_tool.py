#!/usr/bin/env python3
"""Helpers for planning balanced menus (used by the menu-planner agent, .claude/agents/menu-planner.md).

  summary SRC                     one line per recipe: id, base (pasta, riso, zuppa…), proteins, main ingredients
  draft SRC -o FILE [options]     search for a balanced menu and write it as a calderone-menu/1 exchange file
  check FILE --recipes SRC        report what makes a menu file unbalanced or invalid

SRC is a data folder (public/data), a folder of recipe files or an exchange file (see calderone_io.py).
The menu file is imported on the website: Menu -> "Importa / esporta menu".

draft options: --name NAME --weeks N (default 4) --meals cena[,pranzo…] --start YYYY-MM-DD (a Monday; default next Monday)
               --servings N  --leftovers (lunch = the previous dinner's leftovers, as a text dish)
               --exclude ID_OR_TITLE…  --meallog DATA_DIR (recipes eaten in the last 10 days start later)
               --seed N (repeatable result)  --iterations N
"""
import argparse
import datetime as dt
import json
import random
import secrets
import sys
from collections import Counter
from pathlib import Path

from calderone_io import ROOT, base_of, fold, keys_of, load_json, load_recipes, proteins_of

MEALS = ["colazione", "pranzo", "cena", "spuntino"]
DAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]

# Penalty weights: what makes a menu worse (lower total = better). Also used by "check".
W_REPEAT_WEEK = 100      # the same recipe twice in one week
W_REPEAT_NEAR = 60       # the same recipe again within 3 days (also across weeks)
W_SAME_BASE = 8          # pasta after pasta, soup after soup…
W_SHARED_KEY = 2         # each main ingredient shared with the day before (zucca, ceci…)
W_UNEVEN = 15            # a recipe used much more often than another over the cycle
W_PROTEIN = 6            # each missing protein day below the weekly target
W_RECENT = 5             # a recipe eaten in the last days planned again right at the start


class Info:
    """What the scoring needs to know about one recipe."""

    def __init__(self, r: dict):
        self.id = r.get("id")
        self.title = r["title"]
        self.servings = r.get("servings")
        self.base = base_of(r)
        self.proteins = proteins_of(r)
        self.keys = keys_of(r)
        self.tags = r.get("tags") or []


def monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def recent_recipes(data_dir: Path, days: int = 10) -> set[str]:
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    out = set()
    for f in (data_dir / "meallog").glob("*/*.json"):
        for e in load_json(f).get("entries", []):
            if e.get("recipe") and e.get("day", "") >= since:
                out.add(e["recipe"])
    return out


def score(seq: list[Info], weeks: int, recent: set[str] = frozenset(), detail: bool = False):
    """Penalty of a dinner sequence (one dish per day, weeks*7 days, the cycle wraps around)."""
    n = len(seq)
    total = 0
    notes = []
    for w in range(weeks):
        week = [r.id for r in seq[w * 7:(w + 1) * 7]]
        for rid, c in Counter(week).items():
            if c > 1:
                total += W_REPEAT_WEEK * (c - 1)
                if detail:
                    notes.append(("WARN", f"week {w + 1}: {title_of(seq, rid)} {c} times"))
        prot = sum(1 for r in seq[w * 7:(w + 1) * 7] if r.proteins)
        target = 3
        if prot < target:
            total += W_PROTEIN * (target - prot)
            if detail:
                notes.append(("WARN", f"week {w + 1}: only {prot} days with legumes/tofu/eggs… (aim for {target}+)"))
    for i in range(n):
        a = seq[i]
        for gap in (1, 2, 3):
            b = seq[(i + gap) % n]
            if n > gap and a.id == b.id and not (weeks * 7 <= gap):
                total += W_REPEAT_NEAR
                if detail:
                    notes.append(("WARN", f"{day_name(i)} and {day_name((i + gap) % n)}: {a.title} again after {gap} day(s)"))
        b = seq[(i + 1) % n]
        if n > 1 and a.id != b.id:
            if a.base == b.base and a.base != "altro":
                total += W_SAME_BASE
                if detail:
                    notes.append(("NOTE", f"{day_name(i)}→{day_name((i + 1) % n)}: {a.base} two days running"))
            shared = a.keys & b.keys
            total += W_SHARED_KEY * len(shared)
            if detail and shared:
                notes.append(("NOTE", f"{day_name(i)}→{day_name((i + 1) % n)}: shares {', '.join(sorted(shared))}"))
    uses = Counter(r.id for r in seq)
    if uses:
        spread = max(uses.values()) - min(uses.values())
        if spread > 1:
            total += W_UNEVEN * (spread - 1)
            if detail:
                notes.append(("NOTE", f"uneven use: {max(uses.values())}× vs {min(uses.values())}× across the cycle"))
    for i in range(min(3, n)):
        if seq[i].id in recent:
            total += W_RECENT
            if detail:
                notes.append(("NOTE", f"{day_name(i)}: {seq[i].title} was eaten in the last days"))
    return (total, notes) if detail else total


def title_of(seq, rid):
    return next((r.title for r in seq if r.id == rid), rid)


def day_name(i: int) -> str:
    return f"W{i // 7 + 1} {DAYS[i % 7]}"


def search(pool: list[Info], weeks: int, recent: set[str], iterations: int, rnd: random.Random) -> list[Info]:
    """Local search: start from shuffled rounds of all recipes, then try swaps and replacements that lower the penalty."""
    n = weeks * 7
    best, best_score = None, None
    restarts = 8
    for _ in range(restarts):
        seq = []
        while len(seq) < n:
            rnd.shuffle(pool)
            seq += pool
        seq = seq[:n]
        cur = score(seq, weeks, recent)
        for _ in range(iterations // restarts):
            i = rnd.randrange(n)
            cand = seq[:]
            if rnd.random() < 0.7:
                j = rnd.randrange(n)
                cand[i], cand[j] = cand[j], cand[i]
            else:
                cand[i] = rnd.choice(pool)
            s = score(cand, weeks, recent)
            if s <= cur:
                seq, cur = cand, s
        if best_score is None or cur < best_score:
            best, best_score = seq, cur
    return best


def resolve(pool: list[Info], keys: list[str]) -> set[str]:
    out = set()
    for k in keys:
        for r in pool:
            if r.id == k or fold(r.title) == fold(k):
                out.add(r.id)
    return out


def cmd_summary(a):
    recipes = load_recipes(a.src)
    print(f"{len(recipes)} recipes in {a.src}\n")
    print(f"{'id':10} {'base':8} {'proteins':16} {'serv':>4}  title — main ingredients")
    for r in sorted(recipes, key=lambda r: fold(r["title"])):
        i = Info(r)
        print(f"{(i.id or '-')[:8]:10} {i.base:8} {','.join(i.proteins) or '-':16} {i.servings or '?':>4}  "
              f"{i.title} — {', '.join(sorted(i.keys))}" + (f"  #{' #'.join(i.tags)}" if i.tags else ""))
    bases = Counter(Info(r).base for r in recipes)
    print("\nbases:", ", ".join(f"{b} {c}" for b, c in bases.most_common()))
    print("with proteins:", sum(1 for r in recipes if proteins_of(r)), "of", len(recipes))


def cmd_draft(a):
    recipes = [r for r in load_recipes(a.src) if r.get("id")]
    pool = [Info(r) for r in recipes]
    if a.exclude:
        drop = resolve(pool, a.exclude)
        pool = [r for r in pool if r.id not in drop]
    if not pool:
        sys.exit("no recipes to plan with")
    meals = [m for m in MEALS if m in a.meals.split(",")] or ["cena"]
    main = "cena" if "cena" in meals else meals[0]
    recent = recent_recipes(Path(a.meallog)) if a.meallog else set()
    rnd = random.Random(a.seed)
    seq = search(pool, a.weeks, recent, a.iterations, rnd)
    start = dt.date.fromisoformat(a.start) if a.start else monday(dt.date.today()) + dt.timedelta(days=7)
    items = []
    for i, r in enumerate(seq):
        w, d = i // 7 + 1, i % 7 + 1
        items.append({"week": w, "day": d, "meal": main, "recipe": r.id, "title": r.title, "text": "",
                      "servings": a.servings})
        if a.leftovers and "pranzo" in meals and main == "cena":
            nxt = (i + 1) % len(seq)
            items.append({"week": nxt // 7 + 1, "day": nxt % 7 + 1, "meal": "pranzo", "recipe": None, "title": None,
                          "text": f"Avanzi: {r.title}"[:120], "servings": None})
    total, notes = score(seq, a.weeks, recent, detail=True)
    menu = {
        "format": "calderone-menu/1", "id": secrets.token_hex(16), "name": a.name,
        "notes": a.notes or f"Generated by menu_tool.py from {len(pool)} recipes (penalty {total}).",
        "start": monday(start).isoformat(), "weeks": a.weeks, "meals": meals, "season": None, "active": True,
        "items": sorted(items, key=lambda x: (x["week"], x["day"], MEALS.index(x["meal"]))),
    }
    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([menu], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print_plan(seq, a.weeks)
    print(f"\npenalty {total} (0 = nothing to improve)")
    for level, text in notes:
        print(f"  {level} {text}")
    print(f"\nwrote {out}")


def print_plan(seq: list[Info], weeks: int):
    for w in range(weeks):
        print(f"\nWeek {w + 1}")
        for d in range(7):
            r = seq[w * 7 + d]
            print(f"  {DAYS[d]}  {r.title}  [{r.base}{', ' + ', '.join(r.proteins) if r.proteins else ''}]")


def cmd_check(a):
    data = load_json(Path(a.file))
    menus = data if isinstance(data, list) else [data]
    recipes = {r["id"]: r for r in load_recipes(a.recipes) if r.get("id")}
    by_title = {fold(r["title"]): r for r in recipes.values()}
    warns = 0
    try:
        from jsonschema import Draft202012Validator
        schema = Draft202012Validator(load_json(ROOT / "schema" / "menu-exchange.schema.json"))
    except ImportError:
        schema = None
    for m in menus:
        print(f"== {m.get('name', '?')} ({m.get('weeks')} weeks, {', '.join(m.get('meals', []))})")
        if schema:
            for e in schema.iter_errors(m):
                warns += 1
                print(f"  ERROR {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}")
        weeks, meals = int(m.get("weeks", 1)), m.get("meals", ["cena"])
        main = "cena" if "cena" in meals else meals[0]
        slots = {(w, d, x): [] for w in range(1, weeks + 1) for d in range(1, 8) for x in meals}
        for it in m.get("items", []):
            k = (it.get("week"), it.get("day"), it.get("meal"))
            if k not in slots:
                warns += 1
                print(f"  ERROR item outside the menu: {k}")
                continue
            r = recipes.get(it.get("recipe")) if it.get("recipe") else None
            if it.get("recipe") and not r:
                r = by_title.get(fold(it.get("title") or ""))
                print(f"  {'NOTE' if r else 'WARN'} recipe {it['recipe']} ({it.get('title')}) not in {a.recipes}"
                      + (": will match by title" if r else ": will be imported as a text dish"))
                warns += 0 if r else 1
            slots[k].append(r or it.get("text") or None)
        empty = [k for k, v in slots.items() if not any(v)]
        for w, d, x in empty:
            warns += 1
            print(f"  WARN empty: week {w} {DAYS[d - 1]} {x}")
        seq = []
        for w in range(1, weeks + 1):
            for d in range(1, 8):
                dish = next((v for v in slots[(w, d, main)] if isinstance(v, dict)), None)
                seq.append(Info(dish) if dish else None)
        if all(seq):
            total, notes = score(seq, weeks, detail=True)
            for level, text in notes:
                warns += level == "WARN"
                print(f"  {level} {text}")
            print(f"  penalty {total}; recipes used: {len(set(r.id for r in seq))} of {len(recipes)}")
        else:
            print(f"  (balance not scored: {sum(1 for s in seq if not s)} {main} slots have no recipe)")
    print("OK" if not warns else f"{warns} warning(s)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("summary")
    s.add_argument("src")
    s.set_defaults(fn=cmd_summary)
    d = sub.add_parser("draft")
    d.add_argument("src")
    d.add_argument("-o", "--output", required=True)
    d.add_argument("--name", default="Menu")
    d.add_argument("--notes", default="")
    d.add_argument("--weeks", type=int, default=4)
    d.add_argument("--meals", default="cena")
    d.add_argument("--start")
    d.add_argument("--servings", type=float)
    d.add_argument("--leftovers", action="store_true")
    d.add_argument("--exclude", nargs="*", default=[])
    d.add_argument("--meallog")
    d.add_argument("--seed", type=int)
    d.add_argument("--iterations", type=int, default=20000)
    d.set_defaults(fn=cmd_draft)
    c = sub.add_parser("check")
    c.add_argument("file")
    c.add_argument("--recipes", default=str(ROOT / "public" / "data"))
    c.set_defaults(fn=cmd_check)
    a = ap.parse_args()
    if getattr(a, "weeks", 1) < 1 or getattr(a, "weeks", 1) > 12:
        sys.exit("--weeks must be 1..12")
    a.fn(a)


if __name__ == "__main__":
    main()
