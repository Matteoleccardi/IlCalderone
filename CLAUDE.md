# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Il Calderone: a recipe web app, **phone-first** (design and check every page at ~390 px width first). It has an **Angular 22 front end** (`web/`), a **framework-free PHP ≥ 8.1 API** (`public/api/`) and **JSON-file
storage** (`public/data/`, no database). The server must never need Python, Node, Composer packages or non-default PHP extensions:
the target is free PHP hosting (Altervista). The UI is translated (it/en/de/fr, see i18n below); code and docs are English
(the project will be open source on the owner's GitHub).
`PLAN.md` holds the decisions, roadmap and open questions; update it when a decision changes or a milestone lands.
The v0.1 Python/FastAPI prototype lives in `legacy/` and is frozen.

## Commands

- Release for a server: `./deploy.sh [--altervista] [--base-href /sub/] [--data-dir PATH] [--with-data]` (`--altervista` = `AddHandler av-php84 .php` in `.htaccess`: Altervista picks PHP by that line, and uploading our `.htaccess` replaces theirs; keep `.htaccess` files ASCII-only) → `release/IlCalderone-<version>/`
  (+ zip, with `docs/install.md` as INSTALL.md); it builds into `web/dist` and never touches `public/`. Keep `docs/install.md` in sync with it.
- Build the front end: `cd web && npm run build`. This is `ng build` plus `scripts/publish.mjs`, which copies `web/dist/web/browser` into
  `public/`. **Never point `ng build` output at `public/`**: the builder empties its output folder (api/ + data/).
- Dev: `cd web && npm run api` (PHP on :8080) and `npm start` (Angular on :4200, proxying /api).
  Or serve a build: `php -S 127.0.0.1:8080 -t public public/api/router-dev.php`.
- Tests:
  - `cd web && npm test`: `scripts/check-i18n.mjs` (translation keys) then Vitest;
  - `conda run -n CLAUDE python -m pytest -q tests`: every test starts its own `php -S` on a temp `CALDERONE_DATA_DIR`;
  - one test: `… pytest tests/test_api.py::test_variants_graph -q`.
- Data tools (conda env `CLAUDE`):
  - `python tools/validate.py DIR`: schema plus graph checks;
  - `python tools/seed_data.py SRC --owner USER [--data DIR]`;
  - `python tools/export_from_ricette.py --xlsx PATH`: spreadsheet → `seed/`.
  - `python tools/menu_tool.py summary|draft|check …`: balanced menu planning (used by the menu-planner agent).
  - `python tools/audit_recipes.py [--existing SRC] [--new inbox/]`: spelling/unit/duplicate audit.
  - `python tools/recipe_media.py crop|icon|photo …`: dish photo from a cover screenshot, the Inkscape export of hand-drawn
    8-bit icons, the photo made from an icon.
  - `python tools/dish_kit.py build inbox/<slug>/dish.json` / `render MODEL.vox`: the voxel model of a dish with its cutlery
    (dish.json format in `.claude/agents/recipe-importer.md` step 4) → `model.vox`, `icon.png` (40° view, no cutlery),
    `photo.png` (top view, 4:3, framed like the 3D view's start) and `preview.png`. Slow-ish (≈25 s, pure Python ray casting).
  - `python tools/pack_recipes.py inbox/`: `inbox/<slug>/{recipe.json,photo.jpg,icon.png}` → one import file in `exports/`.
  - SRC for these is a data folder, a folder of recipe files or a site export file (`tools/calderone_io.py`).
- PHP CLI: `php public/api/bin/create-user.php NAME [--admin]` (password via `CALDERONE_PASSWORD` or a prompt),
  `php public/api/bin/reindex.php`. Both honour `CALDERONE_DATA_DIR`.
- Node 26 / npm 12 come from nvm: in non-interactive shells run `source ~/.bashrc` first (otherwise the old system
  Node 22.22.2 is found, which is too old for Angular 22).
- Test on the owner's phone over NetBird: `PHP_CLI_SERVER_WORKERS=4 php -S <NetBird IP>:8080 -t public public/api/router-dev.php`
  (get the IP with `ip -4 addr show wt0`; the interface is in firewalld's trusted zone; don't bind 0.0.0.0, that exposes the Wi-Fi LAN).
- Smoke tests: use a scratch `CALDERONE_DATA_DIR`, never `public/data`.
  Don't `pkill -f` a pattern that also appears in the same shell command (it kills the shell).
- Local PHP has no mbstring and no GD. Use `Util::lower`/`Util::clip`, never `mb_*` directly.
- Avoid PHP > 8.1 features: no typed class constants, no `json_validate`.

## Architecture

- `public/api/index.php` runs, in order: `calderone_app()` (bootstrap.php) → `Auth::start` (session in `data/sessions`,
  XSRF cookie) → `checkCsrf` (every non-GET request needs `X-XSRF-TOKEN` matching the session) → `App::dispatch` → JSON.
  Errors: throw `HttpError(status, 'code', [params])` with a code from `lib/Messages.php` (English fallback text) and add
  `err.<code>` to every `web/src/i18n/*.ts`. The API never returns human texts (selfcheck and import messages are codes too).
  Anything else becomes a 500 and goes to `error_log`.
- `Request::apiPath()` takes the route from the part after `/api`, so the app works in any sub-folder and with or without rewriting.
- **Modules**: `public/api/modules/<name>/module.php` returns `['name','label','requires','register' => fn(App $app)]`.
  `register` adds routes (`$app->get('/x/{id}', fn(Request $r, array $p) => …)`), listeners (`$app->on('recipe.deleted', …)`)
  and services (`$app->services['recipes']`). The enabled modules are listed in `config.php` `modules`; `core` is always on.
- **Permissions**: `App::canView` / `canEdit` / `isOwner` / `cleanScope` apply to any item with `owner`/`visibility`/`household`
  (recipes, collections, menus). `canEdit` = owner or a member of the item's household. Recipe delete, visibility and variant
  links are owner-only (`Recipes::ownedOr403`). Return 404 (not 403) for items the user cannot see.
- **Spaces**: `App::space($user, 'me'|householdId)` = personal space (implicit one-person household, file key `u-<id>`) or a
  household (`h-<id>`). Menus, pantries and shopping lists belong to spaces. Diaries are readable by `App::peerIds`.
- **Recipe history**: `Recipes::update` archives the old file to `history/<id>/<rev>.json` and bumps `rev` (skips no-op
  edits). Variants are separate recipes. New recipes default to `shared`; variants inherit the parent's visibility.
- **Menus/shopping**: `Menus` (N-week cycle from a start Monday, `slot()`, `itemsOn()`, `plan()`, `fits()`); the shopping
  list is computed live in `modules/shopping` (scaled + summed per lowercase name|unit, minus pantry) and only ticks,
  extras and personal→household moves are stored.
- **Storage**: always go through `Store` (`read`/`write`/`update`/`locked`, re-entrant lock, atomic writes).
  Recipes: `Recipes::save()` keeps `index/recipes.json` in sync, and listing/search reads only the index.
  Add variant edges only through `Recipes::withParent()`, which does the cycle check.
- **Formats**: `schema/*.json` is the source of truth; update it (and `docs/data-format.md`, `tools/validate.py`) whenever a file shape changes.
  The exchange format is `calderone-recipe/1`; import is idempotent on `id`.
- **Front end** (`web/src/app`):
  - Standalone components, signals, zoneless, so update state through signals or template events.
  - **i18n**: every visible text is a key: `{{ 'x.y' | t }}`, `i18n.t()`, `notify.ok('x.y')`, route `title`/nav `label`.
    `src/i18n/it.ts` is the reference; `en/de/fr.ts` are typed against it (build fails on missing keys). Plurals "one|other"
    only with an `{n}` param. Client-side errors: `throw new AppError('key', params)`. Language = account `lang` or browser;
    changing it reloads the page. Stored values (`meal.cena`, `kind.variant`, `field.title`) are translated via key prefixes.
  - `core/api.ts` makes promise calls to relative `api/…` URLs and throws `ApiError` with the server's message.
  - `features/<x>/<x>.feature.ts` exports a `Feature` (module, routes, nav, `recipePanels`, `recipeActions`), registered in `features.registry.ts`.
    The routes match only when the PHP module is enabled.
  - Recipe-page panels are components with `recipe = input.required<Recipe>()`, rendered via `NgComponentOutlet`.
    Recipe actions (e.g. menus' "Add to menu") take `recipe: RecipeRef` and `compact` (true on cards) and appear on
    every recipe card and in the recipe page's buttons.
  - Recipe choosers use `shared/recipe-picker.ts` (own suggestion list, alphabetical via `I18n.compare`), never
    `<datalist>`: phone browsers support it badly.
  - Text formats shared with v0.1 are in `core/text-formats.ts`.
- Units: every spoon is `tbs` (1 cucchiaino = 1/3 tbs), plus `g`, `ml`, `p.`, `spicchi`, `foglie`, `cm`, `q.b.`
  (stored as is; only `q.b.` is translated on display).
- `taken_from` (was `source`) is optional; the page shows "Fonte: <owner name> · da <taken_from>". Never put bookkeeping
  such as "Ricette.xlsx · IMG_…" there (the loader and `tools/seed_data.py` drop it).
  Photos show the dish only, with no app UI. The owner's 9 recipes use their 8-bit picture as the photo too
  (`recipe_media.py photo`, a 4:3 transparent PNG; the original photos are backed up outside the repo in `../backups/`). The sibling spreadsheet project is documented in `../CLAUDE.md`.
- `seed/` (the owner's 9 recipes transcribed from a commercial app) is git-ignored and must not be published; `examples/` is the public sample.
  "seed" = starter data loaded once with `tools/seed_data.py`; the live copy is `public/data/`, and app edits never go back to `seed/`.
- Recipe icons: optional `icon` = `<id>.icon.png` in `media/` (PNG ≤ 64 KB, ≤ 512 px), routes `/recipes/{id}/icon`, `icon_data` in exchange files.
- 3D dish: optional `model` = `<id>.model.vox` (MagicaVoxel, ≤ 256 KB) in `media/`, routes `/recipes/{id}/model`,
  `model_data` in exchange files, copied to variants, uploaded in the editor. `shared/dish-stage.ts` shows the picture and,
  with a model, loads `core/vox.ts` + `shared/dish-scene.ts` (Three.js, a lazy chunk: never import `three` elsewhere):
  visible faces only with vertex AO, palette alpha < 255 = see-through steam. One tilt + turn from the top view,
  crossfading with the picture via `--dish-fade`; the top-view framing must stay equal to `dish_kit.py render_top`
  (FILL 0.92, whole pixels per voxel on 1024×768, centred). Lights: hemisphere "overcast" (bright on light themes, dim on
  dark), warm key with shadows, golden highlight. No model / no WebGL / reduced motion → just the picture.
- Every recipe, menu and collection page shows its JSON file name (`shared/file-name.ts`).
- Batch import (`shared/json-batch.ts`): many files / a folder / drag-and-drop, sent in chunks under the server's
  `post_max_size` (exposed as `max_upload` in `GET /session`; a body PHP dropped gives 413 `request_too_large`).
  Recipes are sent parents first so variant links work across chunks.
- Kitchen timers (`core/timers.ts`, `shared/timer-dock.ts`): up to 5, a tab on the right edge of every page, stored in
  the `calderone_timers` cookie as end times. Ringing = beep + vibration on screen, a notification through `public/sw.js`
  (from `web/public/`) when the page is in the background. Notifications need HTTPS (or localhost) and the user's permission;
  the timer can only ring while the site is open in some tab (no push server).
- **Themes** (`web/src/themes/`, see its README): one CSS file per theme setting the colour tokens on `[data-theme="id"]`,
  generated with `themes.ts` and `index.css` by `tools/make_themes.py` (never edit them by hand; it enforces WCAG AA).
  `core/theme.ts` (`ThemeService`) picks the favourite light/dark theme (auto = `prefers-color-scheme`), saves it in
  localStorage `calderone.theme` and the account (`PUT /me {theme}`); the inline script in `index.html` applies it before
  the first paint. Never hard-code colours in CSS: use the tokens. The `:where(:root)` fallback in `styles.css` must keep zero specificity.
- **Fonts** (bundled via `@fontsource`, listed in `angular.json` styles): Bricolage Grotesque (`--font`, titles and UI; `--font-figure` = the same, bold tabular, for timers and quantities) and Literata
  (`--font-read`, recipe ingredients/steps/notes). No external font CDN. The style manifest is `docs/design.md`.
- The top-bar title is `shared/brand.ts`: this week's logo from `web/public/logos/{light,dark,medium}/` (light logos on dark themes, medium on both),
  listed by `web/scripts/logos.mjs` into `logos.json` (git-ignored, run by build/start/deploy.sh) and chosen by `core/logo.ts`
  (continuous week count, seeded shuffle per cycle). `router-dev.php` URL-decodes static paths (file names with spaces).
- Layout: the top bar is only the centred logo plus "name · logout"; page navigation is `nav.bottom-nav` fixed at the
  bottom on every screen size: one row of accent-coloured line icons (`shared/nav-icon.ts`, by page path; order `NAV_ORDER`
  in `app.ts`), each with the page name as title/aria-label. Its height is kept in
  `--nav-h` (ResizeObserver): anything fixed or sticky at the bottom must sit above it (`bottom: var(--nav-h)`).
- Timer lengths are picked on wheels (`shared/duration-wheel.ts`, full-screen overlay, outside the transformed dock).
- **Recipe classification (facets)**: `public/api/modules/recipes/facets.json` is the single source (facet, single/multi,
  max, required, values); `Facets.php` cleans and filters, `GET /recipes/facets` serves it, `GET /recipes?course=…&diet=…`
  filters, `calderone_io.facets_of/facet_problems` read it in the tools, and `check-i18n` requires `facet.<f>.<value>`
  in every language. Recipes store `facets`; the old free-text `category` is read as the course (Recipes::upgrade) and
  dropped on save. Course and diet are required when saving from the editor (`facets_required`), not on import
  (`import_facets_missing` warning). Diet suggestion from ingredients: `suggestDiet` (core/facets.ts) = `suggest_diet`
  (tools/calderone_io.py), keep both lists in sync. "Quick" (≤ 20 min) is derived, never stored.
- Menu exchange: `Menus::toExchange`/`import` (`schema/menu-exchange.schema.json`); items carry `title` so they match by title elsewhere.

## Agents (`.claude/agents/`)

- `menu-planner`: plans a balanced N-week menu from SRC with `tools/menu_tool.py`, writes `exports/<slug>.calderone-menu.json`
  and explains how to import it (website *Menu → Importa / esporta menu*, locally or on Altervista; never FTP into `data/`).
- `recipe-importer`: screenshots (natural order, several recipes per batch) → `inbox/<slug>/recipe.json` + `photo.jpg`
  + an 8-bit 32×32-grid SVG icon exported by Inkscape to 128×128 PNG → audit and fix → user review → `pack_recipes.py`
  → import on the website. Existing recipes are only reported, and fixed by the user in the editor (keeps history).
- Both never write into `public/data/`; `inbox/` and `exports/` are git-ignored.
