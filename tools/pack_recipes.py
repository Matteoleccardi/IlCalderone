#!/usr/bin/env python3
"""Bundle reviewed recipes from an inbox folder into one file to import on the website (Ricette -> Importa).

Usage: python tools/pack_recipes.py inbox/ [-o exports/calderone-ricette-<date>.json] [--only SLUG …]
Each inbox/<slug>/ holds recipe.json (calderone-recipe/1), and optionally photo.jpg and icon.png: they are embedded
as photo_data / icon_data. Recipes without an id get a new random one. Everything is checked against
schema/recipe.schema.json; the file is not written if anything is invalid.
"""
import argparse
import base64
import datetime as dt
import json
import secrets
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

from calderone_io import ROOT, load_json

KEYS = ["format", "id", "title", "servings", "time_minutes", "facets", "tags", "ingredients", "steps", "notes",
        "taken_from", "parents"]


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inbox")
    ap.add_argument("-o", "--output")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    schema = Draft202012Validator(load_json(ROOT / "schema" / "recipe.schema.json"))
    out, errs = [], []
    for d in sorted(p for p in Path(a.inbox).iterdir() if (p / "recipe.json").is_file()):
        if a.only and d.name not in a.only:
            continue
        r = load_json(d / "recipe.json")
        rec = {k: r[k] for k in KEYS if k in r}
        rec["format"] = "calderone-recipe/1"
        if not rec.get("id"):
            rec["id"] = secrets.token_hex(16)
            r["id"] = rec["id"]
            (d / "recipe.json").write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        rec.setdefault("parents", [])
        errs += [f"{d.name}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in schema.iter_errors(rec)]
        if "??" in json.dumps(rec, ensure_ascii=False):
            errs.append(f"{d.name}: still contains '??'")
        photo = next((d / n for n in ("photo.jpg", "photo.png", "photo.webp") if (d / n).is_file()), None)
        if photo:
            rec["photo_data"] = data_uri(photo, {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[photo.suffix[1:]])
        icon = d / "icon.png"
        if icon.is_file():
            if icon.stat().st_size > 65536:
                errs.append(f"{d.name}: icon.png is larger than 64 KB")
            rec["icon_data"] = data_uri(icon, "image/png")
        out.append(rec)
        print(f"{d.name}: «{rec['title']}»{' + photo' if photo else ''}{' + icon' if icon.is_file() else ''}")
    if errs:
        print("\n".join("ERROR " + e for e in errs))
        return 1
    if not out:
        sys.exit("no inbox/<slug>/recipe.json found")
    dest = Path(a.output or ROOT / "exports" / f"calderone-ricette-{dt.date.today().isoformat()}.json")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {dest} ({len(out)} recipes, {dest.stat().st_size // 1024} KB)")
    print("Load it on the website: Ricette -> Importa / esporta -> File -> choose who sees them -> Importa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
