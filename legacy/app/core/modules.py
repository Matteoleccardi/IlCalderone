"""Feature-module registry. A module is a package app/modules/<name>/ exposing MODULE."""
import importlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from fastapi import APIRouter


@dataclass
class Panel:
    """A block a module contributes to another module's page (rendered with its own template)."""
    template: str
    ctx: dict


@dataclass
class Module:
    name: str
    label: str
    router: APIRouter
    nav: list[tuple[str, str]] = field(default_factory=list)          # (label, url) in the header
    templates: Path | None = None
    requires: tuple[str, ...] = ()
    template_filters: dict[str, Callable] = field(default_factory=dict)
    # hook: (db, user, recipe) -> Panel | None, shown on the recipe page
    recipe_panels: list[Callable] = field(default_factory=list)


def load_modules(names: tuple[str, ...]) -> list[Module]:
    mods = [importlib.import_module(f"app.modules.{n}").MODULE for n in names]
    enabled = {m.name for m in mods}
    for m in mods:
        missing = set(m.requires) - enabled
        if missing:
            raise RuntimeError(f"il modulo '{m.name}' richiede: {', '.join(sorted(missing))}")
    return mods
