from pathlib import Path

from app.core.modules import Module
from app.modules.meallog import models  # noqa: F401
from app.modules.meallog.routes import recipe_panel, router

MODULE = Module(
    name="meallog", label="Cosa ho mangiato?", router=router, requires=("recipes",),
    nav=[("Cosa ho mangiato?", "/diario")],
    templates=Path(__file__).parent / "templates",
    recipe_panels=[recipe_panel],
)
