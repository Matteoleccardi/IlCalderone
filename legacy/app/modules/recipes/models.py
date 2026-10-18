import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import Household, User
from app.db import Base, utcnow

VISIBILITY = {"private": "Privata", "household": "Famiglia", "shared": "Condivisa"}


class Ingredient(Base):
    """Canonical ingredient list shared by all recipes (so shopping lists can sum across recipes)."""
    __tablename__ = "ingredients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)   # lowercase, trimmed name
    default_unit: Mapped[str] = mapped_column(String(30), default="")


class Recipe(Base):
    __tablename__ = "recipes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    title: Mapped[str] = mapped_column(String(200), index=True)
    servings: Mapped[int] = mapped_column(Integer, default=4)
    time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str] = mapped_column(String(60), default="Piatto unico")
    tags: Mapped[str] = mapped_column(String(300), default="")          # comma separated (Tag table in v0.4)
    notes: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(300), default="")
    photo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    visibility: Mapped[str] = mapped_column(String(12), default="private")
    household_id: Mapped[int | None] = mapped_column(ForeignKey("households.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship()
    household: Mapped[Household | None] = relationship()
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        order_by="RecipeIngredient.position", cascade="all, delete-orphan", back_populates="recipe")
    steps: Mapped[list["RecipeStep"]] = relationship(
        order_by="RecipeStep.position", cascade="all, delete-orphan", back_populates="recipe")

    @property
    def tag_list(self) -> list[str]:
        return [t.strip() for t in self.tags.split(",") if t.strip()]


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id"))
    qty: Mapped[float | None] = mapped_column(Float, nullable=True)      # None = q.b.
    unit: Mapped[str] = mapped_column(String(30), default="")
    optional: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(String(200), default="")
    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(lazy="joined")

    @property
    def name(self) -> str:
        return self.ingredient.name


class RecipeStep(Base):
    __tablename__ = "recipe_steps"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    recipe: Mapped[Recipe] = relationship(back_populates="steps")


class RecipeRelation(Base):
    """Edge of the variant graph (DAG): child was derived from parent."""
    __tablename__ = "recipe_relations"
    parent_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    child_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="variant")     # variant | inspired_by
    note: Mapped[str] = mapped_column(String(200), default="")
