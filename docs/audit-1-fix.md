# Audit 1: fixes and changelog

Branch `audit-one`. Source of the findings: `docs/audit-1.md` (triage bucket A). One section per item, grouped by commit.

## Summary changelog

_(filled in at the end)_

## How items were tested

Headless Chrome (`/usr/bin/google-chrome`) driven over CDP at 390×844 with touch emulation, German interface, against the Angular dev server (`npm start`, :4200) proxying to the existing PHP server on :8080. The harness blocks every non-GET `/api` request except login/logout, and rewrites GET responses in flight to inject long German names. Scripts live outside the repo (session scratchpad). Each fix is also type-checked with `ng build`; each commit with `npm test`.

A note on the assertions: with touch emulation the layout viewport widens to the content, so "no horizontal scroll" is asserted as `documentElement.scrollWidth <= 390`, and each fix was first shown to fail with the old CSS where that was practical.

---

## Commit 1: overflow and text

### A1: Shopping item names can't wrap
- **Problem:** `label.check` is `white-space: nowrap`; a long German ingredient name widened the row and the page.
- **Fix:** inside `ul.shop`, `label.check` wraps (`white-space: normal; overflow-wrap: anywhere; min-width: 0; flex: 1 1 12rem`). The global `nowrap` stays for short labels elsewhere.
- **Files:** `web/src/styles.css` (shopping list block).
- **Test:** injected "Getrocknete Tomaten in Öl eingelegt, abgetropft und fein gehackt" and "Kichererbsenmehl-Mischung-Vollkornweizenmehl". Fixed: page width 390, every row fits (`scrollWidth == clientWidth`). With the old rule re-injected the page grew to 498 px, so the check does detect the bug.

### A3: Timer dock overflows in German
- **Problem:** the note and its link in the ~90 px panel ("Benachrichtigungen einschalten") could not break, and the text was 11 px.
- **Fix:** `.timer-note` and its button get `overflow-wrap: anywhere; hyphens: auto`; font size `.68rem` → `.75rem` (12 px).
- **Files:** `web/src/styles.css`.
- **Test:** dock opened with notification permission "default" and "denied": every element of the note lies inside the panel, font is 12 px. Screenshot shows "Benachrichtigun-gen" hyphenated inside the panel. The panel width did not need to change.

### A4: Long words overflow the ingredient table and steps
- **Fix:** `table.ing td:first-child, .steps li p, .steps p.notes { overflow-wrap: anywhere; hyphens: auto }`.
- **Files:** `web/src/styles.css`.
- **Test:** recipe page with an injected 45-character compound ingredient and a step containing "Donaudampfschifffahrtsgesellschaftskapitänsmütze": page width 390, table inside its card, all steps fit.

### A5: Quantity and unit can wrap apart
- **Fix:** `ul.shop .amount { white-space: nowrap }` (one rule instead of non-breaking spaces in the template; the amount is one span).
- **Files:** `web/src/styles.css`.
- **Test:** computed `white-space` is `nowrap` on every row.

**Commit checks:** `ng build` OK, `npm test` (i18n check + 21 Vitest tests) OK.

---

## Commit 2: touch targets

**Baseline vs after (all main pages, 390 px, touch emulation, German):** 194 interactive elements smaller than 44×44 px before; 11 after, all of them the 28 px timer tab, whose tappable area is 44 px wide (see A7). Inline text links are exempt (WCAG 2.5.8) and were not counted.

### A2: Shopping checkbox and row target
- **Problem:** ~13 px checkbox; only the name text was tappable.
- **Fix:** in `ul.shop`, the label is the whole tappable area (`min-height: 2.75rem`, `align-items: center`), checkbox 1.5 rem with `accent-color`.
- **Files:** `web/src/styles.css`.
- **Test:** label 44 px high, checkbox 24×24. The element under a finger at the far right of the row is the label, and clicking it ticks the box. (Synthetic touch events turned out to be unreliable in headless Chrome, so hit-testing plus a click was used. The resulting `POST /api/shopping/check` was blocked by the harness, so no data changed.)

### A6: Controls under 44 px
- **Fix:** a block at the end of `styles.css` in `@media (pointer: coarse)`: every `button`, `.button`, text input and `select` is at least 2.75 rem high; `button.icon`, `.logout`, stepper ± and `.dish-play` also 2.75 rem wide; `button.link`, `.who a`, `.facet-chip`, `.chip-btn`, `.segmented button`, `label.check`, `details summary`, picker options and `.tags .tag` links get the same minimum. Checkboxes 1.25 rem. Dense desktop layouts are unchanged because the block only applies to touch screens.
- **Files:** `web/src/styles.css`.
- **Test:** the scan above (194 → 11). The recipe editor's ↑ ↓ ✕ buttons measure 44×44.
- **Heads-up:** this is phone/tablet only. A desktop browser will not show it; use device emulation or the phone.

### A7: Timer dock tab and column
- **Fix:** visible tab 22 → 28 px wide with a `::before` extending the tappable area 16 px to the left (44 px total); the ✕/↻ column is 2.75 rem; the panel is wider (6.4 → 8.5 rem) so the time still fits; the "+" rows are 2.75 rem high.
- **Files:** `web/src/styles.css`.
- **Test:** `elementFromPoint` 14 px left of the tab hits the tab, 20 px left does not; ✕ is 44×44; the `1:00` button is not clipped.

### A8: Card "+" button on the phone grid
- **Fix:** 44×44 circle (was ~24×20 with `min-height: 0`), glyph centred, still inside the card; grid still 3-up.
- **Files:** `web/src/styles.css`.
- **Test:** measured 44×44 and inside the card. **Look and decide:** the circle now covers more of the dish picture than before; the card layout is a B (redesign) item.

### A9: `touch-action: manipulation`
- **Fix:** `a, button, input, select, textarea, label, summary { touch-action: manipulation }` (pinch zoom stays; fast double-tap no longer zooms).
- **Files:** `web/src/styles.css`.
- **Test:** computed value on each element type. Real iOS double-tap behaviour was not tested.

### A28: Ingredient row on phones
- **Problem:** the 3-column mobile grid left an empty cell beside quantity and unit.
- **Fix:** 2 columns: name full row; quantity and unit side by side; note full row; "optional" and the ↑↓✕ tools on the last row (tools right-aligned, so three 44 px buttons fit). The name selector is `> :first-child`, so it also works when the field becomes the suggest component (A21).
- **Files:** `web/src/styles.css`.
- **Test:** geometry of the row children in the editor (name spans the row, qty/unit fill the row side by side, no page overflow at 390).

**Commit checks:** `ng build` OK, `npm test` (i18n + 21 Vitest tests) OK.

---

## Commit 3: labels and ARIA

New translation keys (it/en/de/fr): `common.remove_named`, `common.move_up_named`, `common.move_down_named`, `common.delete_named`, `facet.remove_named`, `menus.add_dish_to`, `menus.servings_of`, `timer.ringing`. The now-unused `common.move_up` and `common.move_down` were removed.

### A10: Repeated buttons name their target
- **Problem:** "Remove", "Remove", "Remove": ✕, ↑, ↓, servings and picker controls repeated with identical labels.
- **Fix:** `aria-label` now includes the item: recipe-form rows and steps ("Karotten nach oben", falling back to "Zutat 2" while the name is empty), menu-editor dishes (✕ and servings) and pickers ("Gericht hinzufügen: Montag, Abendessen"; `RecipePicker` got a `label` input), shopping-list actions ("Hab ich immer: Sale", "Zucker entfernen", pantry chips, "bring back"), diary entry delete, and the recipe page's unlink button. Visible text is unchanged and each label still starts with its visible text.
- **Files:** `recipe-form.html/.ts`, `menu-edit.ts`, `recipe-picker.ts`, `shopping-list.ts`, `diary.ts`, `recipe-detail.html`, `i18n/*.ts`.
- **Test:** recipe form (12 unique labels; the first row's label changes to its typed name), shopping list (unique, naming each item). The menu editor was tested against a **faked** menu (your data has none): dish ✕ and servings name the dish, the 7 pickers read "…: Montag, Abendessen", etc.

### A11: Filter-chip label
- **Fix:** `chipLabel()` gives "Filter entfernen: Vegan" (it contains the visible text, so WCAG 2.5.3 is met); the shared text comes from `chipText()`.
- **Files:** `recipe-list.ts`, `i18n/*.ts`.
- **Test:** `/ricette?quick=1&diet=vegana`: both chips have unique labels containing their visible text.

### A12: Decorative glyphs and servings
- **Fix:** `aria-hidden="true"` on decorative ⏱ 👥 ⑂ ⚙ ⚡ 🔔 🔕 🍽 ✔ ⚠ → ← ✕ in cards, recipe page, filters, timer dock, buttons; the card's servings count gets a screen-reader-only "Portionen" label.
- **Files:** `recipe-card.ts`, `recipe-detail.html`, `recipe-list.ts`, `recipe-history.ts`, `menu-edit.ts`, `shopping-list.ts`, `facet-chips.ts`, `home.ts`, `meallog-panel.ts`, `plan-confirm.ts`, `timer-dock.ts`, `duration-wheel.ts`, `recipe-form.html`.
- **Test:** on a recipe card ⏱ and 👥 are `aria-hidden` and the servings label exists.

### A13: Announcements
- **Fix:** a `role="alert"` element (visually hidden) in the timer dock says "Timer abgelaufen" while a timer rings; error toasts use `role="alert"` (success toasts stay `status`).
- **Files:** `timer-dock.ts`, `app.html`.
- **Test:** a blocked write produced an error toast with `role="alert"`; a cookie-set timer ending in 1.5 s made the alert region read "Timer abgelaufen". Sound and screen-reader output themselves were not tested.

### A14: ARIA patterns
- **Fix:** picker input gets `aria-autocomplete="list"`, `aria-haspopup`, and `aria-controls` pointing at the listbox `id` while open; the add-to-menu dialog is named by its `<h2>` (`aria-labelledby`); the fake `tablist`/`tab` (shopping spaces, menu weeks) became plain buttons with `aria-pressed`.
- **Files:** `recipe-picker.ts`, `add-to-menu.ts`, `shopping-list.ts`, `menu-edit.ts`.
- **Test:** `aria-controls` resolves to a `role=listbox`; the dialog's `aria-labelledby` resolves to "Zum Speiseplan hinzufügen"; no `role=tab` left; the active button has `aria-pressed="true"`.

### A15: Skip link (a real bug found while testing)
- **Problem:** besides the missing `tabindex`, `<a href="#main">` with `<base href="/">` resolves to `/#main`, so activating the skip link **navigated to the home page** instead of focusing the content.
- **Fix:** `<main id="main" tabindex="-1" #mainEl>` and the link calls `mainEl.focus()` with `preventDefault()`. `main:focus { outline: none }`.
- **Files:** `app.html`, `styles.css`.
- **Test:** on `/spesa` the skip link keeps the path and `document.activeElement.id === 'main'` (before the fix: path became `/`).

### A16: Tables
- **Fix:** `.table` no longer uses `display: block`; the tables are wrapped in `<div class="table-wrap" tabindex="0" role="region" aria-label=…>` (`overflow-x: auto`).
- **Files:** `styles.css`, `admin.ts`, `recipe-history.ts`.
- **Test:** `/admin`: the table's computed display is `table`, the wrapper is a focusable named region, no page overflow at 390 px.

**Commit checks:** `ng build` OK, `npm test` (i18n: 571 keys, no unused-key warnings; 21 Vitest tests) OK; checks for commits 1-2 re-run and still pass.
