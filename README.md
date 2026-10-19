# 🍲 Il Calderone

**A small, self-hostable, phone-first recipe book for families and groups of friends.**
Private, family and shared recipes · edit history · recipe variants as a graph · weekly menus · automatic shopping list ·
named collections · "What did I eat?" diary.
Runs on any cheap PHP hosting (even free ones) or on your own PC. **No database**: everything is plain JSON files.

> The interface speaks Italian 🇮🇹, English 🇬🇧, German 🇩🇪 and French 🇫🇷 (each user picks theirs). Recipes are shown as
> their authors wrote them. The code, docs and data format are in English.

<!-- Screenshots: add docs/img/list.png, docs/img/recipe.png and reference them here -->

## Features

- **Recipes** with photo, servings (quantities rescale automatically), time, category, tags, optional ingredients, steps and notes.
- **Who can see what**: every recipe and collection is *private*, *household* (your family group) or *shared* (every user);
  new recipes are shared by default. Household recipes and collections can be edited by every member of the household,
  other ones only by their author. Everyone who can see a recipe can make their own **variant** of it.
- **History**: every in-place edit keeps the previous version. See who changed what, compare a version with the one
  before it, and restore any old version.
- **Source line**: "Source: <author> · from <book, site, grandma…>" (the second part is optional).
- **Variant graph**: a recipe can derive from one or more others (variant / adaptation / "inspired by"). Cycles are refused,
  and deleting a recipe keeps its variants.
- **Collections**: "Cena di Natale", "Da provare", …
- **Menus**: cycles of N weeks (like "4 weeks of dinners") that repeat by themselves, with the meals you choose and an
  optional season (e.g. October–March). Everyone has personal menus; households have shared ones. When several menus plan
  the same meal, every option is shown ("Tonight" on the home page, and the plan of the coming days).
- **Shopping list**: computed live from the week's menus (next week from Saturday on), summing the same ingredient
  across recipes and scaled to the servings. Ticks are saved, you can add extra items, and a **pantry** keeps
  always-at-home ingredients off the list. Household menus feed the shared household list, personal menus a personal
  list, whose items can be moved to the household list one by one or all at once.
- **Diary** ("What did I eat?"): log meals from a recipe or as free text, and see the most-cooked recipes. Members of
  a household can read each other's diaries.
- **Households** and **accounts**: made for about 30 people. The first user is the admin and creates the other accounts.
- **Import/export** in an open JSON format (`calderone-recipe/1`), with photos embedded. A backup is a copy of one folder.
- **Modular**: each feature is a PHP module plus an Angular feature folder, and features can be switched off in the config.

## How it works

```
Browser ── Angular app (static HTML/JS/CSS) ──►  /api/…  PHP 8.1+ (no framework, no Composer)
                                                   │
                                                   ▼
                                     data/  ← JSON files + photos (users, recipes, collections, diary…)
```

- **Server needs**: PHP ≥ 8.1 with the default extensions, write access to one folder, and (on Apache) `.htaccess` support.
  No database, no Node and no Python on the server.
- **Developer needs**: Node.js ^22.22.3, ^24.15 or ≥ 26 (to build the Angular app) and `php-cli`. Python 3 is optional, for the tests and data tools.

## Quick start (on your PC)

```bash
git clone <this repo> ilcalderone && cd ilcalderone
cd web && npm ci && npm run build && cd ..            # builds the app into public/
php -S 127.0.0.1:8080 -t public public/api/router-dev.php
```

Open <http://127.0.0.1:8080>. The first visit asks you to create the administrator account.
To load the two example recipes, use *Ricette → Importa / esporta*, or run:

```bash
python3 tools/seed_data.py examples/recipes --owner <your-username> --visibility shared
```

## Claude Code agents

Two [Claude Code](https://claude.com/claude-code) subagents in `.claude/agents/` help with the data. Neither writes into
`public/data/`: they produce a JSON file that you import on the website, locally or on the hosted site.

- **menu-planner**: builds a balanced menu for N weeks from your recipes (no repeats in a week, legumes spread out, no
  pasta after pasta…). Import it under *Menu → Importa / esporta menu*. Its helper is `tools/menu_tool.py`.
- **recipe-importer**: turns recipe screenshots into recipes, with the dish photo and an 8-bit icon drawn with Inkscape.
  It checks names and units against your recipes (`tools/audit_recipes.py`). Import the result under *Ricette → Importa / esporta*.

## Documentation

| | |
|---|---|
| [docs/build.md](docs/build.md) | Development setup, Angular workflow, tests, how to add a feature |
| [docs/deploy.md](docs/deploy.md) | Deploy on your own PC/server, on Altervista (free) or any PHP host; backups and upgrades |
| [docs/data-format.md](docs/data-format.md) | The JSON files, their schemas, and the exchange format |
| [PLAN.md](PLAN.md) | Design decisions, roadmap, open questions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Project layout

```
public/          everything that goes on the server
  api/           PHP back end: index.php (router), lib/, modules/<feature>/, bin/ (CLI)
  data/          the JSON data (protected; git-ignored)
web/             Angular source (src/app/features/<feature>/), builds into public/
schema/          JSON Schemas of every data file
tools/           Python helpers: validate data, load recipes, plan menus, audit and pack recipes
tests/           end-to-end API tests (pytest + php -S)
examples/        sample recipes
seed/            (not in git) the owner's starter recipes, loaded once with tools/seed_data.py;
                 the live copy the app reads and edits is public/data/
.claude/agents/  Claude Code helpers: menu-planner (balanced menus) and recipe-importer (screenshots → recipes)
legacy/          the first prototype (Python/FastAPI), kept for reference
```

## Status

Version **0.3**: accounts, households, recipes with history, variants, menus, shopping lists and pantries, collections,
the diary, import/export and four interface languages work and are tested. Next up: a first real deploy on free hosting
and backups from the admin page; see the [roadmap](PLAN.md#5-roadmap).

## License

[MIT](LICENSE)
