from pathlib import Path

from app.core.modules import Module
from app.modules.recipes import models  # noqa: F401  (registers tables)
from app.modules.recipes.routes import router
from app.modules.recipes.service import fmt_qty

MODULE = Module(
    name="recipes", label="Ricette", router=router,
    nav=[("Ricette", "/ricette")],
    templates=Path(__file__).parent / "templates",
    template_filters={"qty": fmt_qty},
)
