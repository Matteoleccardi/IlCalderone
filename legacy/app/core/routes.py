from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.models import Household, Membership, User
from app.core.security import hash_password, verify_csrf, verify_password
from app.core.web import current_user, redirect, render, require_user
from app.db import get_db

router = APIRouter()


def _safe_next(url: str) -> str:
    return url if url.startswith("/") and not url.startswith("//") else "/"


@router.get("/")
def home(request: Request, user: User = Depends(require_user)):
    return render(request, "home.html")


@router.get("/login")
def login_form(request: Request, next: str = "/", user: User | None = Depends(current_user)):
    return render(request, "login.html", next=_safe_next(next))


@router.post("/login", dependencies=[Depends(verify_csrf)])
def login(request: Request, username: str = Form(...), password: str = Form(...), next: str = Form("/"),
          db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
    if not user or not verify_password(password, user.password_hash):
        return render(request, "login.html", status_code=400, next=_safe_next(next), error="Nome utente o password errati.")
    request.session["uid"] = user.id
    return redirect(_safe_next(next))


@router.post("/logout", dependencies=[Depends(verify_csrf)])
def logout(request: Request):
    request.session.pop("uid", None)
    return redirect("/login")


def _signup_open(request: Request, db: Session) -> bool:
    return request.app.state.settings.allow_signup or db.scalar(select(func.count(User.id))) == 0


@router.get("/registrati")
def signup_form(request: Request, db: Session = Depends(get_db), user: User | None = Depends(current_user)):
    if not _signup_open(request, db):
        raise HTTPException(403, "Le registrazioni sono chiuse: chiedi un account all'amministratore.")
    return render(request, "signup.html")


@router.post("/registrati", dependencies=[Depends(verify_csrf)])
def signup(request: Request, username: str = Form(...), password: str = Form(...), display_name: str = Form(""),
           db: Session = Depends(get_db)):
    if not _signup_open(request, db):
        raise HTTPException(403, "Le registrazioni sono chiuse.")
    username = username.strip()
    error = None
    if not (3 <= len(username) <= 40) or not username.replace("_", "").replace(".", "").isalnum():
        error = "Il nome utente deve avere 3–40 caratteri (lettere, numeri, . e _)."
    elif len(password) < 8:
        error = "La password deve avere almeno 8 caratteri."
    elif db.scalar(select(User).where(func.lower(User.username) == username.lower())):
        error = "Nome utente già in uso."
    if error:
        return render(request, "signup.html", status_code=400, error=error, username=username, display_name=display_name)
    first = db.scalar(select(func.count(User.id))) == 0
    user = User(username=username, display_name=display_name.strip(), password_hash=hash_password(password), is_admin=first)
    db.add(user)
    db.commit()
    request.session["uid"] = user.id
    return redirect("/", "Benvenuto nel Calderone!" + (" Sei l'amministratore." if first else ""), request)


# ---------- households ----------

@router.get("/famiglie")
def households(request: Request, user: User = Depends(require_user)):
    return render(request, "households.html")


@router.post("/famiglie", dependencies=[Depends(verify_csrf)])
def household_create(request: Request, name: str = Form(...), user: User = Depends(require_user),
                     db: Session = Depends(get_db)):
    if not name.strip():
        return redirect("/famiglie", "Dai un nome alla famiglia.", request)
    hh = Household(name=name.strip()[:80])
    hh.memberships.append(Membership(user=user, role="owner"))
    db.add(hh)
    db.commit()
    return redirect("/famiglie", f"Famiglia «{hh.name}» creata.", request)


def _owned_household(db: Session, user: User, hid: int) -> Household:
    m = db.get(Membership, (user.id, hid))
    if not m or m.role != "owner":
        raise HTTPException(403, "Solo il proprietario della famiglia può gestire i membri.")
    return m.household


@router.post("/famiglie/{hid}/membri", dependencies=[Depends(verify_csrf)])
def household_add(request: Request, hid: int, username: str = Form(...), user: User = Depends(require_user),
                  db: Session = Depends(get_db)):
    hh = _owned_household(db, user, hid)
    other = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
    if not other:
        return redirect("/famiglie", f"Utente «{username}» non trovato.", request)
    if db.get(Membership, (other.id, hid)) is None:
        db.add(Membership(user_id=other.id, household_id=hid, role="member"))
        db.commit()
    return redirect("/famiglie", f"{other.label} aggiunto a «{hh.name}».", request)


@router.post("/famiglie/{hid}/membri/{uid}/rimuovi", dependencies=[Depends(verify_csrf)])
def household_remove(request: Request, hid: int, uid: int, user: User = Depends(require_user),
                     db: Session = Depends(get_db)):
    if uid != user.id:
        _owned_household(db, user, hid)          # removing someone else needs ownership; leaving is always allowed
    m = db.get(Membership, (uid, hid))
    if m:
        db.delete(m)
        db.commit()
    return redirect("/famiglie", "Membro rimosso.", request)
