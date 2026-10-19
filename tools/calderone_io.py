"""Shared helpers for the dev tools: load recipes from any of the places they live, and normalise ingredient names.

A recipe source (SRC) can be:
  - a data folder (public/data): reads recipes/*.json;
  - a folder of recipe files (seed/recipes, examples/recipes), or an inbox folder with <slug>/recipe.json;
  - an exchange file (calderone-ricette-<date>.json, the site's "Esporta"): one recipe or a list.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Units used by the app (see CLAUDE.md): every spoon is tbs (1 cucchiaino = 1/3 tbs).
UNITS = {"g", "ml", "p.", "tbs", "spicchi", "foglie", "foglio", "rametti", "cm", "q.b."}

# Ingredients almost every recipe has: they don't make two dishes "the same".
STAPLES = {
    "sale", "pepe", "olio", "aglio", "cipolla", "cipollotto", "brodo", "acqua", "lievito", "limone", "limoni",
    "zucchero", "farina", "aceto", "salsa di soia", "rosmarino", "salvia", "prezzemolo", "basilico", "timo",
    "origano", "menta", "curry", "cumino", "paprika", "zenzero", "curcuma", "peperoncino", "noce moscata",
    "miso", "olio di sesamo", "erba cipollina", "alloro", "maggiorana",
}

# What a dish is built on, for variety from day to day (checked in this order: "gnocchetti" is pasta, not gnocchi).
BASES = [
    ("pasta", ["gnocchetti", "spaghetti", "farfalle", "fusilli", "penne", "rigatoni", "linguine", "tagliatelle",
               "orecchiette", "maccheroni", "trofie", "paccheri", "lasagne", "bucatini", "mezze maniche", "pasta"]),
    ("gnocchi", ["gnocchi"]),
    ("riso", ["riso", "risotto"]),
    ("cereali", ["quinoa", "farro", "orzo", "couscous", "cous cous", "bulgur", "miglio", "grano saraceno", "polenta"]),
    ("pane", ["pane", "pizza", "focaccia", "piadina", "toast", "bruschett"]),
    ("patate", ["patate"]),
]
SOUP_WORDS = ["zuppa", "minestra", "minestrone", "vellutata", "crema di", "brodo di"]

# Protein sources, for a balanced week.
PROTEINS = {
    "legumi": ["ceci", "lenticchie", "fagioli", "piselli", "fave", "lupini", "edamame", "cicerchie", "azuki"],
    "soia": ["tofu", "tempeh", "soia texturizzata"],
    "seitan": ["seitan"],
    "uova": ["uova", "uovo"],
    "formaggi": ["formaggio", "parmigiano", "mozzarella", "ricotta", "pecorino", "feta", "grana", "stracchino"],
    "pesce": ["pesce", "salmone", "tonno", "merluzzo", "orata", "branzino", "gamberi", "acciughe", "alici", "sgombro"],
    "carne": ["pollo", "tacchino", "manzo", "maiale", "vitello", "prosciutto", "salsiccia", "speck", "pancetta"],
}


def fold(s: str) -> str:
    """Lower case without accents: "Pàsta" -> "pasta"."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def clean_name(name: str) -> str:
    """Ingredient name for comparing: folded, without "(pulita)"-style notes and extra spaces."""
    return re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", "", fold(name))).strip()


def stem(name: str) -> str:
    """Rough Italian singular/plural key: "noci sgusciate" ~ "noce sgusciata", "Limoni" ~ "limone"."""
    return " ".join(w[:-1] if len(w) > 3 and w[-1] in "aeio" else w for w in clean_name(name).split())


def is_staple(name: str) -> bool:
    n = clean_name(name)
    return any(n == s or n.startswith(s + " ") for s in STAPLES)


def key_ingredient(name: str) -> str:
    """Main word of an ingredient, for "same ingredient two days running": "Zucca (pulita)" -> "zucca"."""
    words = clean_name(name).split()
    if len(words) >= 3 and words[1] in ("di", "da", "al", "alla"):
        return " ".join(words[:3])  # "latte di cocco" and "latte di soia" are different things
    return words[0] if words else ""


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def load_recipes(src) -> list[dict]:
    """Recipes from a data folder, a folder of recipe files, an inbox folder or an exchange file (see the top)."""
    src = Path(src)
    files: list[Path]
    if src.is_file():
        files = [src]
    elif (src / "recipes").is_dir():
        files = sorted((src / "recipes").glob("*.json"))
    else:
        files = sorted(src.glob("*.json")) + sorted(src.glob("*/recipe.json"))
    out = []
    for f in files:
        data = load_json(f)
        for r in data if isinstance(data, list) else [data]:
            if isinstance(r, dict) and r.get("format", "calderone-recipe/1") == "calderone-recipe/1" and "title" in r:
                r = dict(r)
                r["_file"] = str(f)
                out.append(r)
    return out


def base_of(r: dict) -> str:
    """What the dish is built on: pasta, gnocchi, riso, cereali, pane, patate, zuppa or altro."""
    title = fold(r.get("title", ""))
    if any(w in title for w in SOUP_WORDS):
        return "zuppa"
    names = [clean_name(i["name"]) for i in r.get("ingredients", [])]
    for text in [title] + names:
        for base, words in BASES:
            if any(re.search(rf"\b{re.escape(w)}", text) for w in words):
                return base
    return "altro"


def proteins_of(r: dict) -> list[str]:
    names = " | ".join(clean_name(i["name"]) for i in r.get("ingredients", []))
    return [k for k, words in PROTEINS.items() if any(re.search(rf"\b{re.escape(w)}", names) for w in words)]


def keys_of(r: dict) -> set[str]:
    """Main (non-staple) ingredients of a recipe, by their first word."""
    return {key_ingredient(i["name"]) for i in r.get("ingredients", []) if not is_staple(i["name"])} - {""}
