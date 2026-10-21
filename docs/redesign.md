# Redesign "La dispensa": what was built

Branch `redesign` (from `audit-one`, nothing pushed). The style manifest is `design.md`; the other directions are in `../IDEAS.md`.

## Commits

1. **Docs**: `IDEAS.md`, `docs/design.md`.
2. **Tokens, themes, fonts**: new themes `dispensa-light` (default) and `dispensa-dark` (colours only); Calderone and the 15 community themes stay in the picker. New tokens `--primary`, `--primary-text`, `--line-strong`, `--placeholder`, type scale `--t-xs … --t-xl` (nothing under 12 px), art-pixel spacing/radius, flat fields and buttons, hover only under `@media (hover: hover)`, `viewport-fit=cover`, `manifest.webmanifest`. Fonts: Bricolage Grotesque added, Lato removed. The contrast gate in `tools/make_themes.py` and `tests/test_themes.py` covers the new tokens (text 4.5:1, control borders 3:1).
3. **Shell**: slim top bar; three labelled tabs (Rezepte, Menü, Einkauf) plus "Mehr", a sheet with Kollektionen, Tagebuch, Haushalte, Admin, Konto, new timer, language, logout.
4. **List and cards**: two-up grid, icon at 160 px (5 px per art-pixel), full title, time · diet line, "+ Plan" under the title.
5. **Recipe page and cooking mode**: "Kochen" button and a "Details" disclosure (facets, tags, edit, variant, download, history, delete). Cooking mode `?cucina=1` (`features/recipes/recipe-cook.ts`): sticky servings stepper and ingredient band (tap to tick), all steps in one scroll with the current one large and the previous/next at normal size, timer buttons from durations in the text (`core/durations.ts`), "Weiter/Zurück" bar, screen wake lock, no logo/footer. The timer dock on the right edge became a **timer strip** above the tabs.
6. **Menu and shopping**: day headings with a "Heute" badge and a bar; shopping rows in two lines with a "…" sheet (to household, always at home, remove); week navigation as a grid.
7. **Sheets and errors**: `ConfirmService` + `shared/confirm-sheet.ts` replace all native `confirm()` (the unsaved-changes guard uses it); login shows its error inline with `aria-invalid` and focus.

## Verified

`npm test` (32 Vitest tests incl. `parseDurations`, i18n key check), `ng build`, `pytest tests` (62 passed, themes included), and 390 px browser checks (German/French, light/dark): no horizontal overflow, targets ≥ 44 px, text ≥ 12 px on the cooking mode, tabs, shopping, confirm sheet, login error. Writes to the API were blocked by the test harness; nothing in `public/data` changed.

## Decisions to know

- **Pixel digits dropped.** Pixelify Sans was installed and tried for timers and quantities; its 5 reads as S and 9 as 8, so figures are Bricolage 800 with tabular numerals (`--font-figure`). The package was removed.
- Primary button: saffron in Dispensa; other themes use their accent as `--primary`.
- No undo toast: deletes are permanent on the server, so they ask in the sheet.

## Still open

- Inline field errors only on the login form; recipe form, setup, admin and shopping extras still use toasts (B8).
- Filter chips still expand as a card on the list, not a bottom sheet.
- The editor's stacked controls (step title full width) and the empty/loading/error states of design.md §6 are not restyled yet; `shopping` copy fallback still uses `prompt()`.
- Normal recipe page keeps the 3-column ingredient table (design.md says two columns).
- "Per-recipe colour" (direction 2) and per-step ingredient matching are parked in IDEAS.md.
- Not checked on a real phone: iOS wake lock, safe-area insets, real keyboard.

## Try locally

`cd web && npm run build` (already done once; `php -S 127.0.0.1:8080 -t public public/api/router-dev.php`). Check: Account → Appearance (Dispensa light/dark, Calderone still there), a recipe → "Kochen" (tick ingredients, tap steps, start a timer, leave and come back), More sheet, shopping "…", leaving the recipe form with unsaved text.
