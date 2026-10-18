#!/usr/bin/env python3
"""Validate a Calderone data folder (or exchange files) against schema/*.json, plus graph/reference checks.

Usage: python tools/validate.py [DATA_DIR | FILE.json ...]     (default: public/data)
Exit code 1 if anything is invalid.
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = {p.name.split(".")[0]: Draft202012Validator(json.loads(p.read_text())) for p in (ROOT / "schema").glob("*.schema.json")}


def check(schema: str, path: Path, data) -> list[str]:
    return [f"{path}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
            for e in SCHEMAS[schema].iter_errors(data)]


def validate_dir(d: Path) -> list[str]:
    errs = []
    load = lambda p: json.loads(p.read_text(encoding="utf-8"))
    users = {u["id"] for u in load(d / "users.json")["users"]} if (d / "users.json").exists() else set()
    for name, schema in (("users.json", "users"), ("households.json", "households")):
        if (d / name).exists():
            errs += check(schema, d / name, load(d / name))
    recipes = {}
    for p in sorted((d / "recipes").glob("*.json")):
        r = load(p)
        errs += check("recipe", p, r)
        if r.get("id") != p.stem:
            errs.append(f"{p}: id {r.get('id')!r} differs from the file name")
        if users and r.get("owner") not in users:
            errs.append(f"{p}: owner {r.get('owner')!r} is not a known user")
        if r.get("photo") and not (d / "media" / r["photo"]).exists():
            errs.append(f"{p}: photo {r['photo']} missing in media/")
        recipes[p.stem] = r
    # variant graph must be acyclic and point to existing recipes
    for rid, r in recipes.items():
        for par in r.get("parents", []):
            if par["id"] not in recipes:
                errs.append(f"recipes/{rid}.json: parent {par['id']} does not exist")
    state = {}

    def visit(rid, stack):
        if state.get(rid) == 1:
            errs.append("variant cycle: " + " -> ".join(stack + [rid])); return
        if state.get(rid) == 2:
            return
        state[rid] = 1
        for par in recipes[rid].get("parents", []):
            if par["id"] in recipes:
                visit(par["id"], stack + [rid])
        state[rid] = 2
    for rid in recipes:
        visit(rid, [])
    for p in sorted((d / "collections").glob("*.json")):
        errs += check("collection", p, load(p))
    for p in sorted((d / "meallog").glob("*/*.json")):
        errs += check("meallog", p, load(p))
    for p in sorted((d / "history").glob("*/*.json")):
        errs += check("recipe", p, load(p))
    for p in sorted((d / "menus").glob("*.json")):
        m = load(p)
        errs += check("menu", p, m)
        for it in m.get("items", []):
            if it.get("recipe") and it["recipe"] not in recipes:
                errs.append(f"{p}: recipe {it['recipe']} does not exist")
    for p in sorted((d / "pantry").glob("*.json")):
        errs += check("pantry", p, load(p))
    for p in sorted((d / "shopping").glob("*/*.json")):
        errs += check("shopping", p, load(p))
    print(f"{d}: {len(recipes)} recipes checked")
    return errs


def main(args):
    targets = [Path(a) for a in args] or [ROOT / "public" / "data"]
    errs = []
    for t in targets:
        if t.is_dir() and ((t / "recipes").exists() or (t / "users.json").exists()):
            errs += validate_dir(t)
        else:
            files = sorted(t.glob("*.json")) if t.is_dir() else [t]
            for f in files:
                data = json.loads(f.read_text(encoding="utf-8"))
                for r in data if isinstance(data, list) else [data]:
                    errs += check("recipe", f, r)
            print(f"{t}: {len(files)} exchange file(s) checked")
    for e in errs:
        print("ERROR", e)
    print("OK" if not errs else f"{len(errs)} error(s)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
