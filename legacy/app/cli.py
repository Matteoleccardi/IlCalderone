"""Command line:  python -m app.cli <command>

  create-user USERNAME [--admin] [--display-name NAME]     (asks for the password)
  import DIR_OR_FILE --owner USERNAME [--visibility shared]  (calderone-recipe/1 JSON; copies photos from <dir>/../media)
  export DIR [--owner USERNAME]                             (one JSON file per recipe)
"""
import argparse
import getpass
import json
import shutil
import sys
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.config import load_settings
from app.core.models import User
from app.core.security import hash_password
from app.main import create_app
from app.modules.recipes import service as svc
from app.modules.recipes.models import Recipe


def _session():
    app = create_app(load_settings())
    return app.state.settings, sessionmaker(app.state.engine, expire_on_commit=False)()


def _user(db, username: str) -> User:
    u = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    if u is None:
        sys.exit(f"utente «{username}» non trovato")
    return u


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user"); c.add_argument("username"); c.add_argument("--admin", action="store_true")
    c.add_argument("--display-name", default=""); c.add_argument("--password", help="(solo per script/test)")
    i = sub.add_parser("import"); i.add_argument("path"); i.add_argument("--owner", required=True)
    i.add_argument("--visibility", default="shared", choices=["private", "household", "shared"])
    e = sub.add_parser("export"); e.add_argument("dir"); e.add_argument("--owner")
    a = ap.parse_args(argv)
    settings, db = _session()

    if a.cmd == "create-user":
        pw = a.password or getpass.getpass("Password: ")
        if len(pw) < 8:
            sys.exit("la password deve avere almeno 8 caratteri")
        db.add(User(username=a.username, display_name=a.display_name, password_hash=hash_password(pw), is_admin=a.admin))
        db.commit()
        print(f"utente «{a.username}» creato{' (admin)' if a.admin else ''}")

    elif a.cmd == "import":
        p = Path(a.path)
        files = sorted(p.glob("*.json")) if p.is_dir() else [p]
        items = []
        for f in files:
            data = json.loads(f.read_text(encoding="utf-8"))
            items.extend(data if isinstance(data, list) else [data])
        media_src = (p if p.is_dir() else p.parent).parent / "media"
        for d in items:                                   # bring the photos along
            if d.get("photo") and (media_src / d["photo"]).exists():
                shutil.copy2(media_src / d["photo"], settings.media_dir / d["photo"])
        created, msgs = svc.import_json(db, items, _user(db, a.owner), a.visibility)
        db.commit()
        print(f"{len(created)} ricette importate")
        for m in msgs:
            print(" -", m)

    elif a.cmd == "export":
        out = Path(a.dir); out.mkdir(parents=True, exist_ok=True)
        stmt = select(Recipe)
        if a.owner:
            stmt = stmt.where(Recipe.owner_id == _user(db, a.owner).id)
        n = 0
        for r in db.scalars(stmt):
            (out / f"{r.id}.json").write_text(json.dumps(svc.to_json(db, r), ensure_ascii=False, indent=2), encoding="utf-8")
            n += 1
        print(f"{n} ricette esportate in {out}")


if __name__ == "__main__":
    main()
