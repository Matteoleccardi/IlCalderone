from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, utcnow
from app.modules.recipes.models import Recipe

MEALS = {"colazione": "Colazione", "pranzo": "Pranzo", "cena": "Cena", "spuntino": "Spuntino"}


class MealLogEntry(Base):
    """'Cosa ho mangiato?' — one entry per meal; keeps its text even if the recipe is deleted."""
    __tablename__ = "meal_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    meal: Mapped[str] = mapped_column(String(12), default="cena")
    recipe_id: Mapped[str | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True)
    text: Mapped[str] = mapped_column(String(200), default="")
    servings: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    recipe: Mapped[Recipe | None] = relationship()
