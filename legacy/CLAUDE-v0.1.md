# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Il Calderone: FastAPI + SQLAlchemy 2 + SQLite web app (server-rendered Jinja2, Pico.css and htmx vendored in
`app/static/`, no JS build). Italian UI. `PLAN.md` holds the decisions, data model, roadmap and the open questions
for the owner — keep it updated when a decision changes or a milestone lands.

## Commands (conda env `CLAUDE`)

- Run: `uvicorn app.main:create_app --factory --reload` (data in `./data`, override with `CALDERONE_DATA_DIR`)
- Tests: `python -m pytest -q`; one test: `python -m pytest tests/test_recipes.py::test_variant_graph_and_cycles -q`
- CLI: `python -m app.cli create-user|import|export …`; seed: `python scripts/export_from_ricette.py --xlsx PATH`
- Smoke-test against a throwaway `CALDERONE_DATA_DIR`, never the user's `data/`. Don't `pkill -f` a pattern that
  also appears in the same shell command (it kills the shell).

## Architecture

- `app/main.py:create_app(settings)` is the only entry point (tests build apps with a tmp `Settings`). It loads the
  modules named in `settings.modules`, builds one Jinja environment from core + module template dirs, registers
  module filters/nav, then runs `Base.metadata.create_all` (Alembic is planned for v0.2 — until then a schema change
  needs a fresh DB).
- A feature = `app/modules/<name>/__init__.py` exposing `MODULE = Module(...)` (`app/core/modules.py`): router,
  nav entries, templates dir, `requires`, template filters, and hooks such as `recipe_panels`
  (`(db, user, recipe) -> Panel`) rendered on the recipe page. Modules depend on each other only through
  `requires` and the other module's `service`/`models`.
- Permissions live in `app/modules/recipes/service.py` (`visible_clause`, `can_view`, `can_edit`): only the owner
  edits; visibility `private` / `household` (+`household_id`) / `shared`. Collections reuse the same scopes.
- Variant graph: `RecipeRelation(parent_id, child_id, kind)` DAG; always add edges via `service.add_relation`
  (cycle check). Deleting a recipe keeps its variants.
- Every state-changing form POST depends on `verify_csrf` and carries
  `<input type="hidden" name="csrf" value="{{ csrf_token(request) }}">`. Auth: `require_user` dependency (raises
  `LoginRequired` → redirect to `/login`).
- Edit-form text formats: ingredients `Nome | qty | unità | facoltativo/nota` per line (qty `None` = q.b.), steps
  = blocks separated by blank lines, first line = title (`service.parse_*`).
- Exchange format `calderone-recipe/1` (`service.to_json` / `import_json`, idempotent on `id`); `seed/` uses it.
- Units follow the sibling spreadsheet project (`../CLAUDE.md`): `tbs` for every spoon (1 cucchiaino = 1/3 tbs),
  `g`, `ml`, `p.`, `spicchi`, `foglie`, `rametti`, `cm`, `q.b.`. Photos: dish only, no app UI.
