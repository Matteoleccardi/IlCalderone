from fastapi import Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.models import User
from app.db import get_db


class LoginRequired(Exception):
    pass


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    request.state.user = user
    return user


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise LoginRequired()
    return user


def render(request: Request, name: str, status_code: int = 200, **ctx):
    ctx.setdefault("user", getattr(request.state, "user", None))
    return request.app.state.templates.TemplateResponse(request, name, ctx, status_code=status_code)


def redirect(url: str, msg: str | None = None, request: Request | None = None) -> RedirectResponse:
    if msg and request is not None:
        request.session.setdefault("flash", []).append(msg)
    return RedirectResponse(url, status_code=303)


def pop_flash(request: Request) -> list[str]:
    return request.session.pop("flash", [])
