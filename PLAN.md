# Il Calderone: plan

The decisions, the roadmap and the open questions. The v0.1 plan (Python/FastAPI) is kept in `legacy/PLAN-v0.1.md`.

## 1. Goals

A recipe web app for a closed group (≤ 30 people) that:
- has shared recipes, plus private and household ones ("shared database + private sub-databases");
- links recipes as **variants** in a graph (a child can have several parents);
- lets people upload recipes, editable by their author and, for household recipes, by the household, with a history of edits;
- keeps a "What did I eat?" diary;
- supports households, named collections ("Cena di Natale"), seasonal menus and a shopping list;
- speaks Italian, English, German and French (the interface; user content stays as written);
- is **modular**, so features can be added and removed;
- **hosts anywhere**: the owner's PC, or a free PHP host (Altervista), with no Python and no database on the server;
- keeps **data as JSON files**, so moving it means copying a folder;
- is **open-source ready**: a clean repo, English docs, the MIT license, and no personal data or third-party recipes.

Non-goals: public sign-up at scale, social features, native apps (a PWA may come later), real-time collaboration.

## 2. Architecture decisions

| Topic | Decision | Why / rejected alternatives |
|---|---|---|
| Server runtime | **PHP ≥ 8.1, no framework, no Composer** | The only thing every free/cheap host has. Laravel/Symfony would be overkill for about 1,500 lines; Python was rejected (not on Altervista); Node hosting is rarely free. |
| Storage | **JSON files**, one per entity, plus a derived index | Easy to inspect, back up, diff and migrate. SQLite/MySQL were rejected for portability. At 30 users and a few thousand recipes a full scan is milliseconds. |
| Concurrency | One `flock` around every write; writes go to a temp file and are then renamed (atomic) | Simple and correct for low write rates. |
| Front end | **Angular 22**: standalone components, signals, zoneless, lazy routes; plain CSS; **phone-first** layout | The owner knows Angular and wants to practise it. It builds into static files any host can serve. Most use will be on phones (shopping list in the shop, tonight's dinner). |
| API | JSON REST under `/api`, with routing that works with or without URL rewriting | One front controller (`api/index.php`). |
| Auth | PHP sessions (HttpOnly, SameSite=Lax cookie), `password_hash`, login throttling (10 failures per IP per 15 min) | No external services. |
| CSRF | A double-submit token: the `XSRF-TOKEN` cookie must match the `X-XSRF-TOKEN` header | Angular's HttpClient does it automatically. |
| Sign-up | **Closed.** The first visit creates the admin (`/setup`), and the admin creates accounts | The site may be public on the internet. |
| Visibility | **Login required for everything.** Each item is `private` / `household` / `shared`. New recipes are `shared` by default | Owner's choice (2026-10-18). |
| Editing | Owner, plus every household member for household recipes/collections/menus. Delete, visibility and variant links stay with the owner. Anyone who can see a recipe can make a variant (a copy linked to the original, starting with the original's visibility) | Owner's choice (2026-10-18). |
| Recipe history | Every in-place edit copies the old file to `history/<id>/<rev>.json`; restore = a new version. Photos are not versioned | "Keep a history, not forks" (owner). Full copies are simple and recipes are small. |
| Spaces | Menus, pantries and shopping lists belong to a space: your personal space (an implicit one-person household, like a Linux user's own group) or a household | Owner's idea; one rule for everything. |
| Menus | N-week cycle from a start Monday, repeating forever; meals chosen per menu (default dinner); optional season (month range) and on/off; several dishes per cell. Several active menus on the same meal = every option is shown | Owner's choices (2026-10-18), like the spreadsheet. |
| Shopping list | Computed live from the space's menus for one week (next week from Saturday), summed per ingredient+unit, scaled to servings, minus the space's pantry. Stored on top: ticks, extra items, personal→household moves ("Inserisci nella lista di casa", per item or all) | Owner's choice: live list + saved ticks. Moved items stay live. |
| Diary | Personal, readable by the members of your households | Owner's choice (2026-10-18). |
| Variant graph | Edges stored on the child (`parents[]`), children found through the index, cycles refused, deleting a parent keeps its children | The child owns its links, so no shared edge file is needed. |
| Photos | Shrunk in the browser (canvas → JPEG, ≤ 1600 px), checked server-side with `getimagesize`, served through the API with the recipe's permission check | Needs no GD extension, drops EXIF/GPS data, and keeps private photos private. |
| Exchange format | `calderone-recipe/1`, idempotent on `id`, photos embeddable as data URIs | Backups, sharing between installations, a future import from other apps. |
| Modularity | A PHP module (`modules/<x>/module.php`: routes, events, `requires`) plus an Angular feature (`features/<x>/<x>.feature.ts`: routes, nav, recipe-page panels), enabled in `config.php` | Collections and the diary are already built this way. |
| Python | Developer tools only: tests, schema validation, seeding, the spreadsheet → JSON converter | Never needed on the server. |
| Language | UI in Italian, English, German (standard Hochdeutsch) and French; code and docs in English. Own small i18n service: typed dictionaries (`web/src/i18n/*.ts`), runtime switch with a page reload, one build. API errors are codes translated by the app | Angular's built-in i18n needs one build and folder per language; ngx-translate/Transloco add a dependency. User content is not translated (the browser can). |
| License | MIT | Permissive and simple. The owner can change it before publishing. |
| Repository | The owner's personal GitHub | Owner's choice (2026-10-18). |

## 3. Data layout

See [docs/data-format.md](docs/data-format.md) and `schema/`. In short: `users.json`, `households.json`,
`recipes/<id>.json`, `history/<id>/<rev>.json`, `media/`, `collections/<id>.json`, `meallog/<user>/<YYYY-MM>.json`,
`menus/<id>.json`, `pantry/<space>.json`, `shopping/<space>/<monday>.json`, and the derived `index/recipes.json`.

## 4. Security

- `data/` is denied by `.htaccess` in two places (the root rewrite and `data/.htaccess`), plus an `index.php` that returns 403.
  The dev router blocks it as well. `api/.htaccess` allows only `index.php`.
- The admin self-check fetches `data/users.json` over HTTP and warns if it can be read.
- Every endpoint except `session`, `login` and `setup` requires a login. Invisible items return 404 so their existence doesn't leak.
- Input is cleaned on the server: lengths are capped, quantities parsed, and visibility checked against the user's households.
- Uploads: size limit, image-type check, and the file is stored as `<recipeId>.<ext>`, never under the client's file name.
- Known gaps (see the roadmap):
  - there is no password-reset email, because the admin resets passwords by hand;
  - sessions last 30 days;
  - there is no audit log.

## 5. Roadmap

- **v0.1** (2026-10-18), *done, then replaced*: a Python/FastAPI/SQLite prototype, now in `legacy/`.
- **v0.2** (2026-10-18), *done*: rebuilt as Angular + PHP + JSON, with feature parity plus admin accounts, password
  change, photo permission checks, embedded photos in export, linking an existing recipe as a parent, self-check, open-source docs.
- **v0.3** (2026-10-19), *done*: household editing with recipe history, "Source: author · from …", shared-by-default
  recipes, household-readable diaries, menus (N-week cycles, seasons, personal and household), the plan of the coming
  days and "Tonight" with one-click "I ate it", live shopping lists with pantry, ticks, extra items and moving personal
  items to the household list, and the interface in Italian, English, German and French.
- **v0.4: deploy and hardening**:
  - a first real Altervista deploy;
  - data backup as a zip from the admin page;
  - a recipe ownership transfer, for when an account is deleted;
  - an xlsx/CSV export of the shopping list (today: "copy as text");
  - an admin audit of recipes;
  - an optional invite link instead of admin-created passwords.
- **v0.5: variants and finding things**:
  - a graph view of a recipe family;
  - an ingredient diff between variants;
  - filters by category, tag and time; favourites; ratings.
- **v0.6: import**:
  - from the screenshot workflow of the spreadsheet project (`../parsed/*.json`), from URLs (schema.org/Recipe) and from text;
  - printable recipe cards.
- **Later**: a PWA/offline mode (shopping list in the shop!), nutrition, unit conversion, more languages, federation between installations.

## 6. Development status (v0.3.0, 2026-10-19)

Works and is tested:
- **API**: 17 end-to-end tests (`tests/test_api.py`). Besides v0.2 (setup, login, CSRF, throttling, visibility,
  households, variants and cycles, import/export, photos, collections, diary, admin, self-check, data folder not served)
  they cover: household editing and the owner-only actions, history (list, old version, restore, no-op edits, cleanup),
  household-readable diaries, menus (Monday snapping, cycle repetition, seasons, several menus on one meal, recipe
  visibility in household menus), shopping lists (scaling and sums, `q.b.`, pantry, ticks, extra items, moving to and
  back from the household list, move-all), the language preference and the error codes.
- **Front end**: 9 unit tests (parsers, plural rules, nested error translation, same placeholders in every language)
  plus `scripts/check-i18n.mjs` (402 keys, every literal key and every API error code translated). Clean production build.
- **Real browser** (headless Chrome, two users in one household): recipe page with the new source line, menu creation
  and the week grid, the plan with options from two menus, "Tonight", personal and household shopping lists with moves,
  pantry and extras, a household member editing a recipe and its history with the diff, the diary of the whole
  household, German/English/French pages, mobile and dark mode. No console errors, no failed requests.

Known limitations:
- Not yet deployed on Altervista. Its `.htaccess` behaviour must be confirmed with the self-check.
- Deleting a user keeps their recipes; shared ones stay visible, but nobody can edit them until ownership transfer exists.
- The search is a substring match (no accent folding: "ragu" doesn't match "ragù").
- Photos are not part of the history (replacing a photo cannot be undone); decided: text history only.
- The shopping list adds up only identical name+unit pairs: "Brodo vegetale 200 ml" and "Brodo vegetale q.b." stay two
  lines (flagged "different units"); spelling must match across recipes, as in the spreadsheet.
- Menu seasons are edited by month in the UI (the data supports any MM-DD).
- Translations were written by the developer (Claude), not by native speakers: worth a read by one.

## 7. Open decisions for the owner

Answered on 2026-10-19: the spreadsheet stays untouched for now; the repository will be `IlCalderone` on the owner's
GitHub (not created yet); collections and menus stay private by default; history is text only (no old photos);
styling waits until the main features work. **The site is phone-first**: design and test every page at phone width first.

1. **License**: MIT, or another one, before publishing.
