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
