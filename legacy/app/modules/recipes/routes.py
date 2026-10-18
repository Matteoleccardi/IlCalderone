import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.media import save_image
from app.core.models import User
from app.core.security import verify_csrf
from app.core.web import redirect, render, require_user
from app.db import get_db, utcnow
from app.modules.recipes import service as svc
from app.modules.recipes.models import VISIBILITY, Recipe

router = APIRouter(prefix="/ricette")


def _get_visible(db: Session, user: User, rid: str) -> Recipe:
    r = db.get(Recipe, rid)
    if r is None or not svc.can_view(user, r):
        raise HTTPException(404, "Ricetta non trovata.")
    return r


def _get_own(db: Session, user: User, rid: str) -> Recipe:
    r = _get_visible(db, user, rid)
    if not svc.can_edit(user, r):
        raise HTTPException(403, "Solo il proprietario può modificare questa ricetta: crea una variante.")
    return r


@router.get("")
def recipe_list(request: Request, q: str = "", mine: bool = False, user: User = Depends(require_user),
                db: Session = Depends(get_db)):
    return render(request, "recipes/list.html", recipes=svc.visible_recipes(db, user, q, mine), q=q, mine=mine,
                  VISIBILITY=VISIBILITY)


def _form(request, r: Recipe | None, error: str | None = None, **values):
    return render(request, "recipes/form.html", status_code=400 if error else 200, r=r, error=error,
                  VISIBILITY=VISIBILITY, **values)


@router.get("/nuova")
def recipe_new(request: Request, user: User = Depends(require_user)):
    return _form(request, None, ingredients_text="", steps_text="")


async def _save(request: Request, db: Session, user: User, r: Recipe | None, title: str, servings: int,
                time_minutes: str, category: str, tags: str, notes: str, ingredients_text: str, steps_text: str,
                visibility: str, household_id: str, photo: UploadFile | None, remove_photo: bool):
    values = dict(ingredients_text=ingredients_text, steps_text=steps_text)
    try:
        if not title.strip():
            raise ValueError("serve un titolo")
        ingredients = svc.parse_ingredients(ingredients_text)
        steps = svc.parse_steps(steps_text)
        minutes = int(time_minutes) if time_minutes.strip() else None
        photo_name = None
        if photo is not None and photo.filename:
            photo_name = save_image(request.app.state.settings.media_dir, await photo.read())
    except ValueError as e:
        return _form(request, r, error=str(e).capitalize(), **values)
    new = r is None
    if new:
        r = Recipe(owner_id=user.id)
        db.add(r)
    r.title, r.servings, r.time_minutes = title.strip()[:200], max(1, servings), minutes
    r.category, r.tags, r.notes = category.strip() or "Piatto unico", tags.strip(), notes.strip()
    r.visibility, r.household_id = svc.clean_scope(user, visibility, int(household_id) if household_id else None)
    if photo_name:
        r.photo = photo_name
    elif remove_photo:
        r.photo = None
    r.updated_at = utcnow()
    db.flush()
    svc.set_content(db, r, ingredients, steps)
    db.commit()
    return redirect(f"/ricette/{r.id}", "Ricetta creata." if new else "Ricetta salvata.", request)


@router.post("/nuova", dependencies=[Depends(verify_csrf)])
async def recipe_create(request: Request, title: str = Form(""), servings: int = Form(4), time_minutes: str = Form(""),
                        category: str = Form(""), tags: str = Form(""), notes: str = Form(""),
                        ingredients_text: str = Form(""), steps_text: str = Form(""), visibility: str = Form("private"),
                        household_id: str = Form(""), photo: UploadFile | None = File(None),
                        user: User = Depends(require_user), db: Session = Depends(get_db)):
    return await _save(request, db, user, None, title, servings, time_minutes, category, tags, notes,
                       ingredients_text, steps_text, visibility, household_id, photo, False)


@router.get("/importa")
def recipe_import_form(request: Request, user: User = Depends(require_user)):
    return render(request, "recipes/import.html", VISIBILITY=VISIBILITY)


@router.post("/importa", dependencies=[Depends(verify_csrf)])
async def recipe_import(request: Request, files: list[UploadFile] = File(...), visibility: str = Form("private"),
                        household_id: str = Form(""), user: User = Depends(require_user),
                        db: Session = Depends(get_db)):
    vis, hid = svc.clean_scope(user, visibility, int(household_id) if household_id else None)
    items = []
    for f in files:
        try:
            data = json.loads((await f.read()).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return render(request, "recipes/import.html", status_code=400, VISIBILITY=VISIBILITY,
                          error=f"{f.filename}: non è un file JSON valido.")
        items.extend(data if isinstance(data, list) else [data])
    created, msgs = svc.import_json(db, items, user, vis, hid)
    db.commit()
    return render(request, "recipes/import.html", VISIBILITY=VISIBILITY, created=created, msgs=msgs)


@router.get("/esporta.json")
def recipe_export_mine(user: User = Depends(require_user), db: Session = Depends(get_db)):
    data = [svc.to_json(db, r) for r in svc.visible_recipes(db, user, mine=True)]
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="calderone-ricette.json"'})


@router.get("/{rid}")
def recipe_detail(request: Request, rid: str, porzioni: int | None = None, user: User = Depends(require_user),
                  db: Session = Depends(get_db)):
    r = _get_visible(db, user, rid)
    servings = porzioni if porzioni and 0 < porzioni <= 100 else r.servings
    factor = servings / r.servings if r.servings else 1
    panels = [p for p in (fn(db, user, r) for fn in request.app.state.recipe_panels) if p]
    vis = lambda pairs: [(x, k) for x, k in pairs if svc.can_view(user, x)]
    return render(request, "recipes/detail.html", r=r, servings=servings, factor=factor,
                  can_edit=svc.can_edit(user, r), parents=vis(svc.parents(db, r)), children=vis(svc.children(db, r)),
                  panels=panels, VISIBILITY=VISIBILITY)


@router.get("/{rid}/modifica")
def recipe_edit(request: Request, rid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    r = _get_own(db, user, rid)
    return _form(request, r, ingredients_text=svc.ingredients_to_text(r), steps_text=svc.steps_to_text(r))


@router.post("/{rid}/modifica", dependencies=[Depends(verify_csrf)])
async def recipe_update(request: Request, rid: str, title: str = Form(""), servings: int = Form(4),
                        time_minutes: str = Form(""), category: str = Form(""), tags: str = Form(""),
                        notes: str = Form(""), ingredients_text: str = Form(""), steps_text: str = Form(""),
                        visibility: str = Form("private"), household_id: str = Form(""),
                        photo: UploadFile | None = File(None), remove_photo: bool = Form(False),
                        user: User = Depends(require_user), db: Session = Depends(get_db)):
    r = _get_own(db, user, rid)
    return await _save(request, db, user, r, title, servings, time_minutes, category, tags, notes,
                       ingredients_text, steps_text, visibility, household_id, photo, remove_photo)


@router.post("/{rid}/variante", dependencies=[Depends(verify_csrf)])
def recipe_variant(request: Request, rid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    parent = _get_visible(db, user, rid)
    child = svc.create_variant(db, user, parent)
    db.commit()
    return redirect(f"/ricette/{child.id}/modifica", "Variante creata: modificala come preferisci.", request)


@router.post("/{rid}/elimina", dependencies=[Depends(verify_csrf)])
def recipe_delete(request: Request, rid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    r = _get_own(db, user, rid)
    title = r.title
    db.delete(r)
    db.commit()
    return redirect("/ricette", f"«{title}» eliminata (le sue varianti restano).", request)


@router.get("/{rid}/json")
def recipe_json(rid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    r = _get_visible(db, user, rid)
    return JSONResponse(svc.to_json(db, r), headers={"Content-Disposition": f'attachment; filename="{r.id}.json"'})
