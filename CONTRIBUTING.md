# Contributing

Thanks for helping! Il Calderone is small on purpose. Please keep it that way:
- It must run on **plain PHP ≥ 8.1 shared hosting**: no Composer packages, no database, and no PHP extensions beyond the defaults (no `mbstring` or `gd` required).
- Data stays in **JSON files** described by `schema/`. If you change a format, bump its version and provide a migration.
- The UI is translated (Italian, English, German, French): every visible text is a key in `web/src/i18n/*.ts`
  (see [Translations](docs/build.md#translations)). Code, comments and docs are in English.
- API errors are codes (`throw new HttpError(404, 'thing_not_found')`), listed in `public/api/lib/Messages.php`
  and translated as `err.<code>`.

## Setup

See [docs/build.md](docs/build.md). In short:

```bash
cd web && npm ci && npm start            # Angular on :4200
cd web && npm run api                    # PHP API on :8080 (another terminal)
```

## Before opening a pull request

```bash
cd web && npm test && npx ng build       # translation check + unit tests + type check
python -m pytest -q tests                # API tests (needs php-cli, pytest, httpx)
python tools/validate.py examples/recipes
```

- New API behaviour comes with a test in `tests/test_api.py`.
- New features follow the module pattern in [docs/build.md](docs/build.md#adding-a-feature) and can be switched off.
- Don't commit anything from `public/data/`, the build output in `public/`, or personal recipes.
