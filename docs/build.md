# Building and developing

## Requirements

| Tool | Version | Used for |
|---|---|---|
| Node.js + npm | Node ^22.22.3, ^24.15 or ≥ 26 | building the Angular app (Angular 22) |
| PHP CLI | ≥ 8.1 | running the API locally (`php -S`) |
| Python 3 + `pytest`, `httpx`, `jsonschema` | optional | API tests, data validation, loading recipes |

On Fedora: `sudo dnf install nodejs php-cli`. On Debian/Ubuntu: `sudo apt install nodejs npm php-cli`.
You don't need a global Angular CLI: use `npx ng …` or the npm scripts below.

> npm 10 sometimes fails on install with `Cannot read properties of null (reading 'edgesOut')`.
> That's an npm bug; use `npx -y npm@11 install` (or `npm ci` after a lock file exists).

### Upgrading Node, npm and Angular

```bash
# Node: either the Fedora package (LTS)…
sudo dnf install nodejs24-bin nodejs24-npm-bin        # may ask to replace the old "nodejs" package
# …or the newest release with nvm, without sudo
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash   # then open a new terminal
nvm install node && nvm alias default node            # "node" = latest; use "nvm install --lts" for the LTS line
npm install -g npm@latest                             # with nvm; with the Fedora package prefix it with sudo

# Angular, one major version at a time (commit first: ng update refuses a dirty tree)
cd web && npx ng update @angular/core@22 @angular/cli@22
npm test && npm run build
```

## Two ways to run while developing

### A. Live reload (recommended while editing the front end)

Two terminals:

```bash
# 1. the PHP API on :8080, with a throwaway data folder
CALDERONE_DATA_DIR=/tmp/calderone-dev php -S 127.0.0.1:8080 -t public public/api/router-dev.php
#    or simply:  cd web && npm run api   (uses public/data)

# 2. the Angular dev server on :4200, which proxies /api to :8080 (web/proxy.conf.json)
cd web && npm start
```

Open <http://localhost:4200>. TypeScript, HTML and CSS changes reload instantly, and PHP changes apply on the next request.

### B. Production build served by PHP

```bash
cd web && npm run build     # = ng build + scripts/publish.mjs
cd .. && php -S 127.0.0.1:8080 -t public public/api/router-dev.php
```

`ng build` writes to `web/dist/web/browser/`, and `scripts/publish.mjs` copies that into `public/`. It is never built straight into
`public/`, because the Angular builder empties its output folder, and that would delete `api/` and `data/`.
The previous build's files are listed in `public/.build-manifest.json` and removed before copying, so old hashed bundles
don't accumulate.

### Testing on your phone

The site is phone-first, so test it on a real phone. The simplest safe way is a private network such as
[NetBird](https://netbird.io) or Tailscale on both the PC and the phone: serve on the PC's private-network address and
open it on the phone.

```bash
cd web && npm run build && cd ..
PHP_CLI_SERVER_WORKERS=4 php -S <PC's NetBird/Tailscale IP>:8080 -t public public/api/router-dev.php
# phone: http://<that IP>:8080   (or the PC's NetBird name, e.g. http://mypc.netbird.cloud:8080)
```

For live reload on the phone: `npm run api` in one terminal (PHP on 127.0.0.1:8080), and
`npx ng serve --host <that IP>` in another, then open `http://<that IP>:4200`.
Binding to `0.0.0.0` also works but exposes the app to everyone on your Wi-Fi; prefer the private-network address.
If the phone cannot connect, allow the port on the private-network interface in your firewall
(Fedora: `sudo firewall-cmd --zone=trusted --change-interface=wt0`).

**Sub-folder deployment** (e.g. `https://example.org/ricette/`): build with
`npx ng build --base-href /ricette/ && node scripts/publish.mjs`.

## Tests

```bash
cd web && npm test                      # translation check (scripts/check-i18n.mjs) + Angular unit tests (Vitest)
python -m pytest -q tests               # API end-to-end: starts php -S on a temp data folder per test
python tools/validate.py public/data    # check every data file against schema/ + graph integrity
```

## Front-end structure (`web/src/app`)

```
core/          services and types shared by everything
  api.ts         promise-based HttpClient wrapper (relative "api/…" URLs, error → ApiError with the server's error code)
  i18n.ts        translations: the I18n service, the `t` pipe, AppError (an error whose message is a translation key)
  session.ts     current user + enabled modules (signals)
  guards.ts      authGuard (login required), adminGuard, moduleEnabled(name)
  features.ts    the Feature interface + FEATURES token
  text-formats.ts  parseQty / fmtQty / parseIngredients / parseSteps (+ .spec.ts)
shared/        small reusable components (scope picker, visibility badge, qty/unit pipes)
features/<x>/  one folder per feature: pages, <x>.feature.ts
features.registry.ts   the list of features
app.ts / app.html      the shell (top bar, toasts)
```

The code uses modern Angular throughout:
- standalone components and signals (`signal`, `computed`, `input()`, `model()`), with new control flow (`@if`, `@for`);
- zoneless change detection;
- lazy routes, with route params bound to inputs (`withComponentInputBinding`);
- template-driven forms (`FormsModule`).

CSRF protection is automatic: `HttpClient` copies the `XSRF-TOKEN` cookie into the `X-XSRF-TOKEN` header.

## Translations

The interface is translated into Italian, English, German and French; what users write (recipes, ingredients, menus…) is not.

- `web/src/i18n/it.ts` is the reference dictionary; `en.ts`, `de.ts` and `fr.ts` are typed against it, so the build fails
  when a key is missing or misspelt. Keys look like `area.thing` (`recipe.steps`, `shop.move_all`).
- In templates: `{{ 'recipe.steps' | t }}`, with parameters `{{ 'recipes.count' | t: { n: list.length } }}`. In code:
  `inject(I18n).t('key', params)`; toasts take keys directly: `notify.ok('form.saved')`.
- Placeholders are `{name}`. Plural forms are written `"one|other"` and chosen by the `{n}` parameter with
  `Intl.PluralRules` (a `|` is only a plural separator when `{n}` is passed).
- The API never sends texts for people: errors are `{error, code, params}` and the app shows the translation of
  `err.<code>` (codes and their English fallback live in `public/api/lib/Messages.php`). Stored values such as meal
  names (`cena`) and variant kinds are keys too: `meal.cena`, `kind.variant`.
- Dates and numbers use the browser's `Intl` with the current language (`i18n.date()`, `i18n.number()`).
- The language comes from the account (`users.json` → `lang`), else the browser; changing it reloads the page.
- `npm test` runs `scripts/check-i18n.mjs`, which checks that every literal key used in `src/app` exists and every API
  error code is translated. A unit test checks that every language uses the same placeholders and plural forms.

**Adding a language**: copy `en.ts` to `xx.ts`, translate it, add it to `LANGS` and `LOADERS` in `core/i18n.ts`, and to
`Auth::LANGS` in `public/api/lib/Auth.php` (and the `lang` enum in `schema/users.schema.json`).

## Back-end structure (`public/api`)

```
index.php        front controller: session → CSRF check → router → JSON
bootstrap.php    loads lib/ and builds the App (also used by bin/ scripts)
config.php       defaults; override in config.local.php (git-ignored) or with CALDERONE_DATA_DIR
lib/             App (router, modules, events, permissions, spaces), Store (JSON files, lock, atomic writes), Auth, Http,
                 Messages (API error codes), Util
modules/<x>/module.php   one feature: routes + event listeners
bin/             create-user.php, reindex.php
router-dev.php   only for php -S (mimics the .htaccess rules)
```

## Adding a feature

Example: a "wine cellar" feature (the real `menus` and `shopping` modules follow the same pattern).

1. **PHP**: create `public/api/modules/wines/module.php`:

   ```php
   <?php
   return [
       'name' => 'wines',
       'label' => 'Cantina',
       'requires' => ['recipes'],              // other modules it uses
       'register' => function (App $app) {
           $app->get('/wines', function (Request $r) use ($app) {
               $u = $app->auth->require();       // login required
               $space = $app->space($u, $r->q('space'));   // "me" or one of the user's households, else 404
               return $app->store->read("wines/{$space['key']}.json", []);
           });
           $app->on('recipe.deleted', fn(string $id) => /* clean up */ null);
       },
   ];
   ```

   Errors are `throw new HttpError(404, 'wine_not_found')`: add the code with an English text to `lib/Messages.php`
   and `err.wine_not_found` to the language files. Then add `'wines'` to `modules` in `config.php`. Services shared by other modules go in `$app->services['name']`
   (see `recipes`). Events emitted today are `recipe.deleted`, `user.deleted` and `household.deleted`.

2. **Angular**: create `web/src/app/features/wines/wines.feature.ts`:

   ```ts
   export const winesFeature: Feature = {
     module: 'wines',
     nav: [{ path: '/cantina', label: 'nav.wines' }],          // labels and titles are translation keys
     routes: [{ path: 'cantina', loadComponent: () => import('./wines').then((m) => m.Wines), title: 'nav.wines' }],
     recipePanels: [],          // optional components shown on every recipe page (input: recipe)
   };
   ```

   Then add it to `features.registry.ts`. The nav entry and routes appear only when the server reports the module as enabled.

3. **Schema and tests**: add `schema/wine.schema.json`, teach `tools/validate.py` about the files, and add API tests in `tests/`.
