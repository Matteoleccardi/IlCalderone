from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import and_, false, or_, select
from sqlalchemy.orm import Session

from app.core.models import User
from app.core.modules import Panel
from app.core.security import verify_csrf
from app.core.web import redirect, render, require_user
from app.db import get_db
from app.modules.collections.models import Collection, CollectionItem
from app.modules.recipes import service as rsvc
from app.modules.recipes.models import VISIBILITY, Recipe

router = APIRouter(prefix="/raccolte")


def _visible(user: User):
    hh = user.household_ids
    return or_(Collection.owner_id == user.id, Collection.visibility == "shared",
               and_(Collection.visibility == "household", Collection.household_id.in_(hh)) if hh else false())


def _get(db: Session, user: User, cid: int, own: bool = False) -> Collection:
    c = db.scalar(select(Collection).where(Collection.id == cid, _visible(user)))
    if c is None:
        raise HTTPException(404, "Raccolta non trovata.")
    if own and c.owner_id != user.id:
        raise HTTPException(403, "Solo il proprietario può modificare questa raccolta.")
    return c


@router.get("")
def collection_list(request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    cols = db.scalars(select(Collection).where(_visible(user)).order_by(Collection.name)).all()
    return render(request, "collections/list.html", collections=cols, VISIBILITY=VISIBILITY)


@router.post("", dependencies=[Depends(verify_csrf)])
def collection_create(request: Request, name: str = Form(...), description: str = Form(""),
                      visibility: str = Form("private"), household_id: str = Form(""),
                      user: User = Depends(require_user), db: Session = Depends(get_db)):
    if not name.strip():
        return redirect("/raccolte", "Dai un nome alla raccolta.", request)
    vis, hid = rsvc.clean_scope(user, visibility, int(household_id) if household_id else None)
    c = Collection(name=name.strip()[:120], description=description.strip(), owner_id=user.id,
                   visibility=vis, household_id=hid)
    db.add(c)
    db.commit()
    return redirect(f"/raccolte/{c.id}", f"Raccolta «{c.name}» creata.", request)


@router.get("/{cid}")
def collection_detail(request: Request, cid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _get(db, user, cid)
    items = [it for it in c.items if rsvc.can_view(user, it.recipe)]
    hidden = len(c.items) - len(items)
    addable = [r for r in rsvc.visible_recipes(db, user) if r.id not in {it.recipe_id for it in c.items}]
    return render(request, "collections/detail.html", c=c, items=items, hidden=hidden, addable=addable,
                  can_edit=c.owner_id == user.id, VISIBILITY=VISIBILITY)


@router.post("/{cid}/aggiungi", dependencies=[Depends(verify_csrf)])
def collection_add(request: Request, cid: int, recipe_id: str = Form(...), note: str = Form(""),
                   back: str = Form(""), user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _get(db, user, cid, own=True)
    r = db.get(Recipe, recipe_id)
    if r is None or not rsvc.can_view(user, r):
        raise HTTPException(404, "Ricetta non trovata.")
    if db.get(CollectionItem, (c.id, r.id)) is None:
        db.add(CollectionItem(collection_id=c.id, recipe_id=r.id, note=note.strip()[:200],
                              position=len(c.items)))
        db.commit()
    target = back if back.startswith("/ricette/") else f"/raccolte/{c.id}"
    return redirect(target, f"«{r.title}» aggiunta a «{c.name}».", request)


@router.post("/aggiungi", dependencies=[Depends(verify_csrf)])
def collection_add_from_recipe(request: Request, cid: int = Form(...), recipe_id: str = Form(...),
                               back: str = Form(""), user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Same as /{cid}/aggiungi, with the collection chosen in a <select> (recipe page panel, no JS needed)."""
    return collection_add(request, cid, recipe_id, "", back, user, db)


@router.post("/{cid}/rimuovi/{rid}", dependencies=[Depends(verify_csrf)])
def collection_remove(request: Request, cid: int, rid: str, user: User = Depends(require_user),
                      db: Session = Depends(get_db)):
    c = _get(db, user, cid, own=True)
    it = db.get(CollectionItem, (c.id, rid))
    if it:
        db.delete(it)
        db.commit()
    return redirect(f"/raccolte/{c.id}", "Ricetta tolta dalla raccolta.", request)


@router.post("/{cid}/elimina", dependencies=[Depends(verify_csrf)])
def collection_delete(request: Request, cid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _get(db, user, cid, own=True)
    db.delete(c)
    db.commit()
    return redirect("/raccolte", "Raccolta eliminata.", request)


def recipe_panel(db: Session, user: User, recipe: Recipe) -> Panel:
    mine = db.scalars(select(Collection).where(Collection.owner_id == user.id).order_by(Collection.name)).all()
    inside = [c for c in db.scalars(select(Collection).join(CollectionItem)
                                    .where(CollectionItem.recipe_id == recipe.id, _visible(user)))]
    return Panel("collections/_recipe_panel.html", dict(my_collections=mine, in_collections=inside))
