from pathlib import Path

from app.core.modules import Module
from app.modules.collections import models  # noqa: F401
from app.modules.collections.routes import recipe_panel, router

MODULE = Module(
    name="collections", label="Raccolte", router=router, requires=("recipes",),
    nav=[("Raccolte", "/raccolte")],
    templates=Path(__file__).parent / "templates",
    recipe_panels=[recipe_panel],
)
