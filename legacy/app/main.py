"""App factory.  Run: uvicorn app.main:create_app --factory --reload"""
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import sessionmaker
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.config import Settings, load_settings
from app.core import models as _core_models  # noqa: F401  (registers tables)
from app.core.modules import load_modules
from app.core.routes import router as core_router
from app.core.security import csrf_token
from app.core.web import LoginRequired, pop_flash
from app.db import Base, make_engine

HERE = Path(__file__).resolve().parent


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Il Calderone", version=__version__)
    app.state.settings = settings
    engine = make_engine(settings.database_url)
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker(engine, expire_on_commit=False)

    modules = load_modules(settings.modules)
    app.state.modules = modules
    app.state.recipe_panels = [p for m in modules for p in m.recipe_panels]

    dirs = [HERE / "core" / "templates"] + [m.templates for m in modules if m.templates]
    templates = Jinja2Templates(directory=[str(d) for d in dirs])
    templates.env.globals.update(
        csrf_token=csrf_token, pop_flash=pop_flash, app_version=__version__,
        nav=[item for m in modules for item in m.nav], enabled_modules={m.name for m in modules},
    )
    for m in modules:
        templates.env.filters.update(m.template_filters)
    app.state.templates = templates

    Base.metadata.create_all(engine)  # TODO(v0.2): replace with Alembic migrations

    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, session_cookie="calderone",
                       max_age=60 * 60 * 24 * 30, same_site="lax", https_only=settings.https_only)
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
    app.include_router(core_router)
    for m in modules:
        app.include_router(m.router)

    @app.exception_handler(LoginRequired)
    async def _login_required(request: Request, exc: LoginRequired):
        return RedirectResponse(f"/login?next={quote(request.url.path)}", status_code=303)

    return app
