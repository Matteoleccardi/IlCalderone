from collections import OrderedDict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import User
from app.core.modules import Panel
from app.core.security import verify_csrf
from app.core.web import redirect, render, require_user
from app.db import get_db
from app.modules.meallog.models import MEALS, MealLogEntry
from app.modules.recipes import service as rsvc
from app.modules.recipes.models import Recipe

router = APIRouter(prefix="/diario")


@router.get("")
def diary(request: Request, giorni: int = 30, user: User = Depends(require_user), db: Session = Depends(get_db)):
    giorni = min(max(giorni, 1), 366)
    since = date.today() - timedelta(days=giorni - 1)
    entries = db.scalars(select(MealLogEntry).where(MealLogEntry.user_id == user.id, MealLogEntry.day >= since)
                         .order_by(MealLogEntry.day.desc(), MealLogEntry.created_at)).all()
    by_day: OrderedDict[date, list] = OrderedDict()
    for e in entries:
        by_day.setdefault(e.day, []).append(e)
    top = db.execute(select(Recipe, func.count(MealLogEntry.id).label("n")).join(MealLogEntry)
                     .where(MealLogEntry.user_id == user.id, MealLogEntry.day >= date.today() - timedelta(days=89))
                     .group_by(Recipe.id).order_by(func.count(MealLogEntry.id).desc()).limit(5)).all()
    return render(request, "meallog/index.html", by_day=by_day, giorni=giorni, MEALS=MEALS, today=date.today(),
                  recipes=rsvc.visible_recipes(db, user), top=top)


@router.post("/aggiungi", dependencies=[Depends(verify_csrf)])
def diary_add(request: Request, day: str = Form(""), meal: str = Form("cena"), recipe_id: str = Form(""),
              text: str = Form(""), servings: str = Form(""), note: str = Form(""), back: str = Form(""),
              user: User = Depends(require_user), db: Session = Depends(get_db)):
    try:
        d = date.fromisoformat(day) if day else date.today()
        portions = float(servings.replace(",", ".")) if servings.strip() else None
    except ValueError:
        return redirect("/diario", "Data o porzioni non valide.", request)
    recipe = None
    if recipe_id:
        recipe = db.get(Recipe, recipe_id)
        if recipe is None or not rsvc.can_view(user, recipe):
            raise HTTPException(404, "Ricetta non trovata.")
    if recipe is None and not text.strip():
        return redirect("/diario", "Scegli una ricetta o scrivi cosa hai mangiato.", request)
    db.add(MealLogEntry(user_id=user.id, day=d, meal=meal if meal in MEALS else "cena", recipe_id=recipe.id if recipe else None,
                        text=(text.strip() or recipe.title)[:200], servings=portions, note=note.strip()[:300]))
    db.commit()
    target = back if back.startswith("/ricette/") else "/diario"
    return redirect(target, "Annotato nel diario.", request)


@router.post("/{eid}/elimina", dependencies=[Depends(verify_csrf)])
def diary_delete(request: Request, eid: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    e = db.get(MealLogEntry, eid)
    if e is None or e.user_id != user.id:
        raise HTTPException(404, "Voce non trovata.")
    db.delete(e)
    db.commit()
    return redirect("/diario", "Voce eliminata.", request)


def recipe_panel(db: Session, user: User, recipe: Recipe) -> Panel:
    last = db.scalar(select(func.max(MealLogEntry.day)).where(MealLogEntry.user_id == user.id,
                                                             MealLogEntry.recipe_id == recipe.id))
    count = db.scalar(select(func.count(MealLogEntry.id)).where(MealLogEntry.user_id == user.id,
                                                               MealLogEntry.recipe_id == recipe.id))
    return Panel("meallog/_recipe_panel.html", dict(last_eaten=last, times_eaten=count, MEALS=MEALS, today=date.today()))
