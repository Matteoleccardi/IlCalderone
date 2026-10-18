#!/usr/bin/env python3
"""Load exchange-format recipes (a folder like seed/recipes or examples/recipes) straight into a data folder,
owned by an existing user. Idempotent: recipes whose id already exists are skipped.
Photos are taken from <folder>/../media/<photo> or from embedded photo_data.

Usage: python tools/seed_data.py SOURCE_DIR --owner USERNAME [--visibility private|household|shared]
                                 [--household ID] [--data public/data]
Create the user first (web /setup, or: php public/api/bin/create-user.php NAME --admin).
"""
import argparse
import base64
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source"); ap.add_argument("--owner", required=True)
    ap.add_argument("--visibility", default="shared", choices=["private", "household", "shared"])
    ap.add_argument("--household"); ap.add_argument("--data", default=str(ROOT / "public" / "data"))
    a = ap.parse_args()
    data, src = Path(a.data), Path(a.source)
    users = json.loads((data / "users.json").read_text())["users"] if (data / "users.json").exists() else []
    owner = next((u for u in users if u["username"].lower() == a.owner.lower()), None)
    if not owner:
        sys.exit(f"user {a.owner!r} not found in {data}/users.json — create it first")
    if a.visibility == "household" and not a.household:
        sys.exit("--visibility household needs --household ID")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (data / "recipes").mkdir(parents=True, exist_ok=True); (data / "media").mkdir(exist_ok=True)
    added = 0
    files = sorted(src.glob("*.json")) if src.is_dir() else [src]
    for f in files:
        items = json.loads(f.read_text(encoding="utf-8"))
        for r in items if isinstance(items, list) else [items]:
            dest = data / "recipes" / f"{r['id']}.json"
            if dest.exists():
                print("skip (exists):", r["title"]); continue
            photo_data = r.pop("photo_data", None)
            if r.get("photo") and (src / ".." / "media" / r["photo"]).exists():
                shutil.copy2(src / ".." / "media" / r["photo"], data / "media" / r["photo"])
            elif photo_data and photo_data.startswith("data:image/"):
                ext = {"jpeg": "jpg"}.get(photo_data[11:].split(";")[0], photo_data[11:].split(";")[0])
                r["photo"] = f"{r['id']}.{ext}"
                (data / "media" / r["photo"]).write_bytes(base64.b64decode(photo_data.split(",", 1)[1]))
            else:
                r["photo"] = None
            # files from before v0.3 call it "source"; the spreadsheet export put bookkeeping there, which is not a source
            taken = r.pop("source", r.get("taken_from", "")) or ""
            r["taken_from"] = "" if taken.startswith("Ricette.xlsx") else taken
            r.update(owner=owner["id"], visibility=a.visibility,
                     household=a.household if a.visibility == "household" else None, created=now, updated=now,
                     rev=1, updated_by=owner["id"])
            r.setdefault("parents", [])
            dest.write_text(json.dumps(r, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
            added += 1; print("added:", r["title"])
    idx = data / "index" / "recipes.json"
    if idx.exists():
        idx.unlink()  # the PHP side rebuilds it on the next request
    print(f"{added} recipe(s) added to {data}")


if __name__ == "__main__":
    main()
