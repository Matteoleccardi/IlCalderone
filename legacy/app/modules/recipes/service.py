"""Recipe domain logic, independent of HTTP: permissions, variant graph, text formats, JSON exchange."""
import re
from fractions import Fraction

from sqlalchemy import and_, false, or_, select
from sqlalchemy.orm import Session

from app.core.models import User
from app.modules.recipes.models import VISIBILITY, Ingredient, Recipe, RecipeIngredient, RecipeRelation, RecipeStep

FORMAT = "calderone-recipe/1"
QB = "q.b."


# ---------- permissions ----------

def visible_clause(user: User):
    hh = user.household_ids
    return or_(Recipe.owner_id == user.id, Recipe.visibility == "shared",
               and_(Recipe.visibility == "household", Recipe.household_id.in_(hh)) if hh else false())


def can_view(user: User, r: Recipe) -> bool:
    return (r.owner_id == user.id or r.visibility == "shared"
            or (r.visibility == "household" and r.household_id in user.household_ids))


def can_edit(user: User, r: Recipe) -> bool:
    return r.owner_id == user.id


def visible_recipes(db: Session, user: User, q: str = "", mine: bool = False) -> list[Recipe]:
    stmt = select(Recipe).where(visible_clause(user))
    if mine:
        stmt = stmt.where(Recipe.owner_id == user.id)
    if q.strip():
        like = f"%{q.strip()}%"
        by_ing = (select(RecipeIngredient.recipe_id).join(Ingredient).where(Ingredient.name.ilike(like)))
        stmt = stmt.where(or_(Recipe.title.ilike(like), Recipe.tags.ilike(like), Recipe.id.in_(by_ing)))
    return list(db.scalars(stmt.order_by(Recipe.title)))


def clean_scope(user: User, visibility: str, household_id: int | None) -> tuple[str, int | None]:
    """Validate the visibility chosen in a form against the user's households."""
    if visibility not in VISIBILITY:
        visibility = "private"
    if visibility == "household":
        if household_id not in user.household_ids:
            household_id = next(iter(sorted(user.household_ids)), None)
        if household_id is None:
            visibility = "private"
    else:
        household_id = None
    return visibility, household_id


# ---------- quantities and text formats ----------

def parse_qty(s: str) -> float | None:
    s = s.strip().lower().replace(",", ".")
    if s in ("", QB, "qb"):
        return None
    if " " in s:                                    # "1 1/2"
        a, b = s.split(None, 1)
        return float(Fraction(a) + Fraction(b))
    return float(Fraction(s))


def fmt_qty(qty: float | None, unit: str = "") -> str:
    if qty is None:
        return QB
    s = f"{qty:.2f}".rstrip("0").rstrip(".")
    return f"{s} {unit}".strip() if unit and unit != QB else s


def parse_ingredients(text: str) -> list[dict]:
    """One ingredient per line:  Nome | quantità | unità | facoltativo/nota   (fields after the name are optional)."""
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        name = parts[0]
        if not name:
            raise ValueError(f"riga {n}: manca il nome dell'ingrediente")
        try:
            qty = parse_qty(parts[1]) if len(parts) > 1 else None
        except (ValueError, ZeroDivisionError):
            raise ValueError(f"riga {n}: quantità non valida «{parts[1]}» (usa un numero, 1/2 o q.b.)")
        unit = parts[2] if len(parts) > 2 and parts[2] else (QB if qty is None else "")
        extra = parts[3] if len(parts) > 3 else ""
        optional = extra.lower().startswith("facoltativ")
        out.append(dict(name=name, qty=qty, unit=unit, optional=optional, note="" if optional else extra))
    return out


def ingredients_to_text(r: Recipe) -> str:
    lines = []
    for i in r.ingredients:
        qty = QB if i.qty is None else fmt_qty(i.qty)
        extra = "facoltativo" if i.optional else i.note
        lines.append(" | ".join([i.name, qty, i.unit] + ([extra] if extra else [])))
    return "\n".join(lines)


def parse_steps(text: str) -> list[dict]:
    """Steps separated by a blank line; the first line of a block is its title when the block has 2+ lines."""
    steps = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue
        title = re.sub(r"^\d+\s*/\s*\d+\s*", "", lines[0]) if len(lines) > 1 else ""
        body = " ".join(lines[1:] if len(lines) > 1 else lines)
        steps.append(dict(title=title, text=body))
    return steps


def steps_to_text(r: Recipe) -> str:
    return "\n\n".join(f"{s.title}\n{s.text}" if s.title else s.text for s in r.steps)


# ---------- content ----------

def get_ingredient(db: Session, name: str, unit: str = "") -> Ingredient:
    key = " ".join(name.split()).lower()
    ing = db.scalar(select(Ingredient).where(Ingredient.key == key))
    if ing is None:
        ing = Ingredient(name=" ".join(name.split()), key=key, default_unit=unit if unit != QB else "")
        db.add(ing)
        db.flush()
    return ing


def set_content(db: Session, r: Recipe, ingredients: list[dict], steps: list[dict]) -> None:
    r.ingredients.clear()
    r.steps.clear()
    db.flush()
    for pos, i in enumerate(ingredients):
        r.ingredients.append(RecipeIngredient(
            position=pos, ingredient=get_ingredient(db, i["name"], i.get("unit", "")), qty=i.get("qty"),
            unit=i.get("unit") or (QB if i.get("qty") is None else ""), optional=bool(i.get("optional")),
            note=i.get("note", "") or ""))
    for pos, s in enumerate(steps):
        r.steps.append(RecipeStep(position=pos, title=s.get("title", ""), text=s.get("text", "")))


# ---------- variant graph ----------

def parents(db: Session, r: Recipe) -> list[tuple[Recipe, str]]:
    rows = db.execute(select(Recipe, RecipeRelation.kind).join(RecipeRelation, RecipeRelation.parent_id == Recipe.id)
                      .where(RecipeRelation.child_id == r.id)).all()
    return [(rec, kind) for rec, kind in rows]


def children(db: Session, r: Recipe) -> list[tuple[Recipe, str]]:
    rows = db.execute(select(Recipe, RecipeRelation.kind).join(RecipeRelation, RecipeRelation.child_id == Recipe.id)
                      .where(RecipeRelation.parent_id == r.id)).all()
    return [(rec, kind) for rec, kind in rows]


def descendant_ids(db: Session, rid: str) -> set[str]:
    seen, frontier = set(), {rid}
    while frontier:
        nxt = set(db.scalars(select(RecipeRelation.child_id).where(RecipeRelation.parent_id.in_(frontier))))
        frontier = nxt - seen
        seen |= nxt
    return seen


def add_relation(db: Session, parent_id: str, child_id: str, kind: str = "variant", note: str = "") -> RecipeRelation:
    """Add an edge parent → child, refusing anything that would create a cycle."""
    if parent_id == child_id or parent_id in descendant_ids(db, child_id):
        raise ValueError("questa relazione creerebbe un ciclo tra varianti")
    rel = db.get(RecipeRelation, (parent_id, child_id))
    if rel is None:
        rel = RecipeRelation(parent_id=parent_id, child_id=child_id, kind=kind, note=note)
        db.add(rel)
    return rel


def create_variant(db: Session, user: User, parent: Recipe) -> Recipe:
    child = Recipe(title=f"{parent.title} (variante)", servings=parent.servings, time_minutes=parent.time_minutes,
                   category=parent.category, tags=parent.tags, notes=parent.notes, photo=parent.photo,
                   source=parent.source, owner_id=user.id, visibility="private")
    db.add(child)
    db.flush()
    set_content(db, child, [dict(name=i.name, qty=i.qty, unit=i.unit, optional=i.optional, note=i.note)
                            for i in parent.ingredients],
                [dict(title=s.title, text=s.text) for s in parent.steps])
    add_relation(db, parent.id, child.id, "variant")
    return child


# ---------- JSON exchange (calderone-recipe/1) ----------

def to_json(db: Session, r: Recipe) -> dict:
    return {
        "format": FORMAT, "id": r.id, "title": r.title, "servings": r.servings, "time_minutes": r.time_minutes,
        "category": r.category, "tags": r.tag_list,
        "ingredients": [dict(name=i.name, qty=i.qty, unit=i.unit, optional=i.optional, note=i.note) for i in r.ingredients],
        "steps": [dict(title=s.title, text=s.text) for s in r.steps],
        "notes": r.notes, "source": r.source, "photo": r.photo,
        "parents": [dict(id=p.id, kind=k) for p, k in parents(db, r)],
    }


def import_json(db: Session, items: list[dict], owner: User, visibility: str = "private",
                household_id: int | None = None) -> tuple[list[Recipe], list[str]]:
    """Import recipes; existing ids are skipped (idempotent). Returns (created, messages)."""
    created, msgs = [], []
    for d in items:
        if d.get("format", FORMAT) != FORMAT:
            msgs.append(f"«{d.get('title', '?')}»: formato non supportato {d.get('format')}")
            continue
        if not d.get("title"):
            msgs.append("ricetta senza titolo ignorata")
            continue
        if d.get("id") and db.get(Recipe, d["id"]):
            msgs.append(f"«{d['title']}» già presente, saltata")
            continue
        r = Recipe(title=d["title"], servings=int(d.get("servings") or 4), time_minutes=d.get("time_minutes"),
                   category=d.get("category") or "Piatto unico", tags=", ".join(d.get("tags") or []),
                   notes=d.get("notes") or "", source=d.get("source") or "", photo=d.get("photo"),
                   owner_id=owner.id, visibility=visibility, household_id=household_id)
        if d.get("id"):
            r.id = d["id"]
        db.add(r)
        db.flush()
        set_content(db, r, d.get("ingredients") or [], d.get("steps") or [])
        created.append((r, d.get("parents") or []))
    for r, ps in created:                      # second pass: link parents that exist locally
        for p in ps:
            if db.get(Recipe, p.get("id")):
                try:
                    add_relation(db, p["id"], r.id, p.get("kind", "variant"))
                except ValueError as e:
                    msgs.append(f"«{r.title}»: {e}")
    return [r for r, _ in created], msgs
