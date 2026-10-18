# Il Calderone — project plan

*Status date: 2026-10-18 · Version of this plan: 1*

Il Calderone ("the cauldron") is a small, self-hostable web app for a group of up to ~20–30 people: a shared and
private recipe book with **recipe variants as a graph**, a **"Cosa ho mangiato?" meal log**, **households**,
**named collections** ("Cena di Natale"), and later **seasonal menus + shopping lists** (the logic that today lives
in `../Ricette.xlsx`). Everything is built as **modules** so features can be added without touching the core.

---

## 1. Goals and non-goals

**Goals**
- Recipes with ingredients, steps, notes, photo, servings, time, category, tags.
- Ownership: only the owner edits a recipe; anyone who can see it can make a **variant** (their own copy, linked
  to the original). Variants form a **directed acyclic graph** (a recipe can have several parents, e.g. "inspired
  by A and B").
- Visibility scopes per recipe/collection: **private** (only me), **household** (my household), **shared** (every
  account on the instance). "Shared database" = shared scope; "private database / sub-database" = private and
  household scopes. One database, filtered by scope.
- Recipes exchangeable as **JSON** (`calderone-recipe/1` format, section 6): import/export, seed data, backups,
  future sync between instances.
- Meal log ("Cosa ho mangiato?"), per user, linked to recipes or free text.
- Households (shared menus/pantry/log later), named collections, seasonal menus with a cycle counter.
- Italian UI. Runs on a domain **or** on a home server/PC with the same artefact.
- Modular: each feature is a package that registers its routes, tables, navigation and extension hooks.

**Non-goals (for now)**: large-scale hosting, a native mobile app, payments, public anonymous browsing, real-time
collaboration, federation between instances (a later possibility, enabled by the JSON format and UUID ids).

## 2. Constraints and assumptions

| Assumption | Consequence |
|---|---|
| ≤ 30 users, low traffic | One process + SQLite is enough; no queue, no cache, no microservices. |
| Self-hosted by a non-ops person | One command to run, one folder (`data/`) to back up, Docker optional. |
| The maintainer already works in Python (conda `CLAUDE` env, openpyxl tooling) | Python backend, same language as the spreadsheet tools. |
| Must keep growing | Module registry + explicit extension hooks; migrations (Alembic) before the first real deployment. |
| Data matters more than code | Open formats: SQLite file + JSON export; nothing proprietary. |

## 3. Architecture decisions

| Area | Decision | Why | Rejected alternatives |
|---|---|---|---|
| Backend | **FastAPI** (Python 3.12) | Typed, async-capable, auto API docs (`/docs`) for a future SPA/mobile client, tiny footprint. | Django (heavier, more opinionated; admin is nice but not needed), Node/Express (second language). |
| ORM / DB | **SQLAlchemy 2** + **SQLite** (WAL), Postgres-ready via `CALDERONE_DATABASE_URL` | SQLite = one file, zero admin, more than enough for 30 users; SQLAlchemy keeps the Postgres door open. | Document DB / JSON files as primary store (no integrity, no queries); Postgres-only (needs a server). |
| Graph of variants | `recipe_relations(parent_id, child_id, kind)` edge table, cycle check on insert | A graph in a relational DB is simple at this size; recursive queries possible later. | Graph DB (overkill), `parent_id` column (tree only, no multi-parent). |
| Frontend | **Server-rendered Jinja2 + Pico.css + htmx** (vendored, no build step) | Works without JS toolchain, fast to change, accessible by default; htmx adds interactivity where needed. The JSON API can later feed a SPA. | React/Vue SPA now (build tooling, two codebases before the domain is stable). |
| Auth | Username + password (scrypt, stdlib), signed session cookie, CSRF token on every form | No external dependency, adequate for a closed group. | OAuth/OIDC (later option for self-hosters with an identity provider), JWT (no benefit for server pages). |
| Ids | Recipes: UUID (hex) — stable across instances for import/export/sync. Everything else: integers. | | |
| Photos | Files in `data/media/`, re-encoded to JPEG ≤ 1600 px via Pillow, UUID file names | Simple backups; re-encoding strips metadata. | Blobs in DB. |
| Config | Environment variables (`CALDERONE_*`), secret key auto-generated in `data/secret_key` | 12-factor, same config for Docker and bare metal. | |
| Packaging/deploy | `uvicorn app.main:create_app --factory`; later a Dockerfile + Caddy (automatic HTTPS) example | | |
| Tests | pytest + FastAPI TestClient, temporary data dir per test | | |

## 4. Domain model

```
User ─┬─< Membership >─ Household
      │
      ├─< Recipe (uuid) ─┬─< RecipeIngredient >─ Ingredient (canonical name, default unit)
      │      │           ├─< RecipeStep
      │      │           └── visibility: private | household(+household_id) | shared
      │      └─< RecipeRelation (parent → child, kind = variant | inspired_by …)   [DAG]
      ├─< Collection ─< CollectionItem >─ Recipe          (module "collections")
      ├─< MealLogEntry (date, meal, recipe? | free text)   (module "meallog")
      └─  [planned] Menu (household, season, cycle weeks) ─< MenuSlot (week, day, meal, recipe, servings)
          [planned] PantryItem (household, ingredient)  → ShoppingList (derived, per week)
```

Rules
- **Edit** a recipe/collection: owner only (household-editable recipes = future option).
- **See** a recipe: owner, or scope `shared`, or scope `household` and member of that household.
- **Variant**: any viewer → new private recipe owned by the viewer, content copied, edge `parent → child`.
  Deleting a recipe removes its edges, never its variants.
- **Ingredients** are a shared canonical list (case-insensitive name) so shopping lists can sum across recipes;
  units follow the spreadsheet conventions (`g`, `ml`, `p.`, `tbs` for every spoon measure, `spicchi`, `foglie`,
  `rametti`, `cm`, `q.b.`); `qty = null` means *q.b.*.
- A meal-log entry belongs to one user; it keeps the text even if the recipe is deleted.

## 5. Module system

`app/core/` = users, sessions, CSRF, households, module registry, base layout. Every feature lives in
`app/modules/<name>/` and exposes a `MODULE` object:

```python
Module(name="collections", label="Raccolte", router=router,
       nav=[("Raccolte", "/raccolte")], templates=Path(...),
       requires=("recipes",), recipe_panels=[panel_fn], template_filters={...})
```

- Enabled modules come from `CALDERONE_MODULES` (default `recipes,collections,meallog`); a module's tables are
  registered by importing it, its routes are mounted, its nav entries appear in the header.
- **Extension hooks** (grow as needed): `recipe_panels` (blocks shown on a recipe page — e.g. "Aggiungi a
  raccolta", "L'ho mangiato"), later `home_widgets`, `json_export_extras`, `ingredient_actions`.
- Modules never import each other's internals except through a dependency declared in `requires`.

## 6. Recipe exchange format `calderone-recipe/1`

```json
{
  "format": "calderone-recipe/1",
  "id": "3f0c…",                     "title": "Zuppa di miso",
  "servings": 4, "time_minutes": 30, "category": "Piatto unico", "tags": ["autunno"],
  "ingredients": [{"name": "Miso", "qty": 0.33, "unit": "tbs", "optional": false, "note": ""},
                  {"name": "Sale", "qty": null, "unit": "q.b.", "optional": false, "note": ""}],
  "steps": [{"title": "Preparate il soffritto", "text": "…"}],
  "notes": "", "source": "Ricette.xlsx", "photo": "3f0c….jpg",
  "parents": [{"id": "…", "kind": "variant"}]
}
```
A file may contain one recipe or a list. Import keeps the `id` (so re-importing is idempotent: existing ids are
skipped) and links `parents` that exist locally. The seed data in `seed/recipes/` (the 9 recipes of
`Ricette.xlsx`, with photos in `seed/media/`) uses this format.

## 7. Security and privacy (closed group, still on the internet)

Done in v0.1: scrypt password hashes, signed `HttpOnly` + `SameSite=Lax` session cookie, CSRF token on all POSTs,
owner checks server-side, uploads re-encoded, signup closable (`CALDERONE_ALLOW_SIGNUP=0`; the first account
becomes admin).
To do before exposing on a domain: HTTPS (Caddy/Traefik), `https_only` cookies, login rate-limit, invite codes,
password change/reset by admin, media served through a permission check (today `/media/<uuid>` is unguessable but
not access-controlled), security headers, automated backups of `data/`.

## 8. Deployment

- **Dev**: `conda activate CLAUDE && uvicorn app.main:create_app --factory --reload` → http://127.0.0.1:8000
- **Home server/PC** (planned v0.3): Docker image or systemd service; `data/` on a backed-up disk; reachable on
  the LAN, or from outside via Tailscale/WireGuard (no open ports) — recommended for a family/friends group.
- **Domain** (planned v0.3): same image behind Caddy with automatic HTTPS; SQLite stays fine at this scale.
- **Backup** = copy `data/` (SQLite file + media + secret) — plus a periodic JSON export.

## 9. Roadmap

| Milestone | Content | Status |
|---|---|---|
| **v0.1 skeleton** | Core (accounts, sessions, CSRF, households), module registry; *recipes* (CRUD owner-only, photo upload, visibility scopes, search, servings scaling, variants graph with cycle check, JSON import/export); *collections*; *meallog* "Cosa ho mangiato?" with top recipes; seed export of the 9 workbook recipes; CLI (create user, import, export); tests | **done (2026-10-18)** |
| v0.2 menus | Module *menus*: household menus with N-week cycle and day counter (port of `MENU SETTIMANALE`), seasonal menus (season/date range), pantry (`DISPENSA`), weekly shopping list with unit-aware sums and the weekend → next-week rule; "log from tonight's menu" into the meal log; Alembic migrations | next |
| v0.3 deploy | Dockerfile, Caddy example, admin page (users, invites, password reset), backups, media permission check, rate limiting | |
| v0.4 graph & discovery | Variant graph view (lineage tree/graph, diff between variant and parent), tags, filters (season, time, ingredient), favourites, ratings/comments per household | |
| v0.5 data in/out | xlsx/Google-Sheets export of menu + shopping list, recipe import from screenshots (the existing transcription workflow) and from URLs, printable recipe cards | |
| later | Nutrition/food groups, unit conversion table, mobile-friendly PWA/offline shopping list, instance-to-instance recipe sharing (JSON + UUIDs), OIDC login | |

## 10. Development status (2026-10-18, v0.1.0)

Working and covered by tests (`python -m pytest -q`, 10 tests) plus a smoke test against a real uvicorn server:
- Accounts (signup/login/logout, first user = admin, closable signup), CSRF on every form, households
  (create, add/remove members, leave).
- Recipes: create/edit/delete (owner only), photo upload, visibility scopes, search by title/ingredient/tag,
  servings scaling, variants (copy + graph edge, cycle check, lineage on the page), JSON export per recipe and
  "all mine", JSON import (idempotent).
- Collections with scopes, "Aggiungi a raccolta" panel on recipe pages.
- "Cosa ho mangiato?" diary (recipe or free text, meal, portions, notes), last-N-days view, top recipes of the
  last 90 days, "L'ho mangiata" panel on recipe pages.
- Seed: the 9 recipes of `Ricette.xlsx` in `seed/` (dish photos, optional ingredients flagged); CLI to import it.

Known limitations of v0.1: no DB migrations yet (schema changes = new DB), no password change/reset UI, no admin
page, media files are not access-controlled, tags are a plain comma list, no menus/shopping list yet, not tried in
a real browser by the developer (HTML verified through HTTP tests only), StarletteDeprecationWarning about `httpx`
in tests (harmless).

## 11. Open decisions that need the owner's input

1. **Hosting target**: home server (which machine/OS?) vs. a domain (which one? VPS provider?) — decides v0.3.
2. **Account creation**: open signup, admin-created accounts, or invite codes? (v0.1: open until you set
   `CALDERONE_ALLOW_SIGNUP=0`; first account = admin.)
3. **Who may edit what**: owner-only (current) vs. "household editors" for shared family recipes.
4. **Default visibility** of new recipes: private (current) or household/shared?
5. **Meal log privacy**: personal only (current) or visible to the household? Should it record portions/notes
   for nutrition later?
6. **Menus**: one menu per household or several (e.g. "Autunno", "Estate")? Are lunches ever planned, or only
   dinners (as in the spreadsheet)?
7. **Language**: Italian only, or bilingual IT/EN UI?
8. **Spreadsheet**: keep `Ricette.xlsx` alive in parallel (sync via JSON) or migrate fully once v0.2 menus exist?
9. **Name/branding**: "Il Calderone" title, logo, colours.
