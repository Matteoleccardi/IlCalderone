from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import User
from app.db import Base, utcnow
from app.modules.recipes.models import Recipe


class Collection(Base):
    """A named set of recipes: "Cena di Natale", "Pranzi veloci"…"""
    __tablename__ = "collections"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    visibility: Mapped[str] = mapped_column(String(12), default="private")
    household_id: Mapped[int | None] = mapped_column(ForeignKey("households.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    owner: Mapped[User] = relationship()
    items: Mapped[list["CollectionItem"]] = relationship(order_by="CollectionItem.position",
                                                         cascade="all, delete-orphan", back_populates="collection")


class CollectionItem(Base):
    __tablename__ = "collection_items"
    collection_id: Mapped[int] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(200), default="")
    collection: Mapped[Collection] = relationship(back_populates="items")
    recipe: Mapped[Recipe] = relationship()
