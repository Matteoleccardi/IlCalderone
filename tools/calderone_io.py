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


# ---- the fixed classification (public/api/modules/recipes/facets.json) ----

FACETS = load_json(ROOT / "public" / "api" / "modules" / "recipes" / "facets.json")["facets"]
LEGACY_COURSE = {"antipasti": "antipasto", "primi": "primo", "primo piatto": "primo", "secondi": "secondo",
                 "secondo piatto": "secondo", "contorni": "contorno", "piatto unico": "piatto_unico", "dolci": "dolce",
                 "dessert": "dolce", "snack": "merenda", "salse": "salsa", "condimento": "salsa", "lievitati": "pane",
                 "bevande": "bevanda"}


def facets_of(r: dict) -> dict:
    """The recipe's facets, every one present (single → value or None, multi → list); an old free-text
    "category" becomes the course, as the app does."""
    raw = r.get("facets") if isinstance(r.get("facets"), dict) else {}
    out = {}
    for name, f in FACETS.items():
        v = raw.get(name)
        out[name] = (v if isinstance(v, list) else [v] if v else []) if f.get("multi") else (v if isinstance(v, str) else None)
    if not raw and r.get("category"):
        c = re.sub(r"\s+", " ", fold(r["category"])).strip()
        key = c.replace(" ", "_")
        out["course"] = key if key in FACETS["course"]["values"] else LEGACY_COURSE.get(c)
    return out


def facet_problems(r: dict) -> list[tuple[str, str]]:
    """("ERROR"|"WARN", text) for unknown values, too many values and missing required facets."""
    out = []
    raw = r.get("facets") if isinstance(r.get("facets"), dict) else {}
    for name in raw:
        if name not in FACETS:
            out.append(("ERROR", f"unknown facet {name!r} (known: {', '.join(FACETS)})"))
    f = facets_of(r)
    for name, d in FACETS.items():
        vals = f[name] if d.get("multi") else [f[name]] if f[name] else []
        for v in vals:
            if v not in d["values"]:
                out.append(("ERROR", f"{name}: {v!r} is not one of {', '.join(d['values'])}"))
        if d.get("max") and len(vals) > d["max"]:
            out.append(("ERROR", f"{name}: at most {d['max']} values"))
        if d.get("required") and not vals:
            out.append(("ERROR", f"{name} missing (required: one of {', '.join(d['values'])})"))
    if "category" in r:
        out.append(("WARN", "old field 'category': use facets.course"))
    return out


# Diet from the ingredient names: keep in sync with suggestDiet() in web/src/app/core/facets.ts.
MEAT = ["carne", "manzo", "maiale", "vitello", "pollo", "tacchino", "agnello", "coniglio", "anatra", "salsicc", "salam",
        "prosciutto", "pancetta", "guanciale", "speck", "bresaola", "mortadella", "wurstel", "lardo", "macinat",
        "cotechino", "brodo di carne", "bacon", "chorizo", "gelatina animale", "strutto"]
FISH = ["pesce", "tonno", "salmone", "merluzzo", "baccala", "stoccafisso", "acciug", "alici", "sgombro", "orata", "branzino",
        "spigola", "gamber", "scamp", "cozz", "vongol", "calamar", "totan", "polpo", "seppi", "sardin", "trota", "aringa",
        "crostace", "colatura", "bottarga", "surimi", "granchio", "aragost", "astice", "capesant", "ostric"]
ANIMAL = ["uov", "tuorl", "album", "latte", "burro", "formagg", "parmigiano", "grana", "pecorino", "mozzarell", "ricotta",
          "panna", "yogurt", "mascarpone", "gorgonzola", "stracchino", "miele", "besciamella", "scamorza", "fontina",
          "provola", "burrata", "feta", "caprino", "emmental", "groviera", "taleggio", "asiago", "robiola", "crescenza",
          "philadelphia"]
PLANT = ["vegan", "vegetal", "di soia", "di cocco", "d'avena", "di avena", "di mandorl", "di riso", "di arachid", "di cacao",
         "di anacardi", "di nocciol", "di sesamo", "tofu", "tempeh", "seitan"]


def suggest_diet(names: list[str]) -> str | None:
    """carne / pesce / vegetariana / vegana from the ingredient names (None without ingredients)."""
    has = lambda n, stems: any(re.search(rf"(^|[^a-z]){re.escape(st)}", n) for st in stems)
    names = [fold(n).strip() for n in names if n and n.strip()]
    if not names:
        return None
    animal = [n for n in names if not has(n, PLANT)]
    if any(has(n, MEAT) for n in animal):
        return "carne"
    if any(has(n, FISH) for n in animal):
        return "pesce"
    if any(has(n, ANIMAL) for n in animal):
        return "vegetariana"
    return "vegana"


FACET_BASE = {"pasta": "pasta", "gnocchi": "gnocchi", "riso": "riso", "cereali": "cereali", "pane_pizza": "pane"}
FACET_PROTEIN = {"legumi": "legumi", "soia_seitan": "soia", "uova": "uova", "formaggi": "formaggi", "pesce": "pesce",
                 "carne": "carne"}


def base_of(r: dict) -> str:
    """What the dish is built on: pasta, gnocchi, riso, cereali, pane, patate, zuppa or altro (from the facets when set)."""
    f = facets_of(r)
    if "zuppa" in f["dish"]:
        return "zuppa"
    for b in f["base"]:
        if b in FACET_BASE:
            return FACET_BASE[b]
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
    from_facets = [FACET_PROTEIN[b] for b in facets_of(r)["base"] if b in FACET_PROTEIN]
    if from_facets:
        return from_facets
    names = " | ".join(clean_name(i["name"]) for i in r.get("ingredients", []))
    return [k for k, words in PROTEINS.items() if any(re.search(rf"\b{re.escape(w)}", names) for w in words)]


def keys_of(r: dict) -> set[str]:
    """Main (non-staple) ingredients of a recipe, by their first word."""
    return {key_ingredient(i["name"]) for i in r.get("ingredients", []) if not is_staple(i["name"])} - {""}
