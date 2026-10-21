# IlCalderone front-end audit (phone width, 390 px first)

Date: 2026-10-21. Scope: `web/src` (templates, components, global styles), reviewed against the Web Interface Guidelines. No code was changed.

Not opened: `home.ts`, `diary.ts`, `account.ts`, `admin.ts` (body), `households.ts`, `collection-*.ts`, `week-plan.ts`, `menu-list.ts`, `menu-import.ts`, `recipe-import.ts`, `recipe-history.ts`, `theme-picker.ts`, `scope-picker.ts`. The same patterns probably repeat there, so grep for them. Contrast ratios are hand-computed on the `:where(:root)` fallback palette (`styles.css:5-18`), not on the 16 generated themes. The app was not run in a browser, so layout claims come from reading the CSS.

## Accessibility

- `styles.css:259` has `.table { display: block; overflow-x: auto }`. This strips table semantics in Safari/VoiceOver (used at `admin.ts:17`, `recipe-history.ts:40`). The scroll region also has no `tabindex="0"`, so keyboard users can't scroll it.
- `shopping-list.ts:30,33` and `menu-edit.ts:123-131` use `role="tablist"`/`role="tab"` with no `tabpanel`, no `aria-controls` and no arrow-key handling. These are really toggle buttons, so use `aria-pressed` buttons or a full tabs pattern.
- Row buttons share one label, so a screen reader hears "Remove, Remove, Remove". The affected places are:
  - `menu-edit.ts:179-186` and `:167-177`: servings and ✕ have no dish name
  - `recipe-form.html:63-65`: move up/down/remove have no row name
  - `shopping-list.ts:149-155` and `:209-216`
  - `recipe-detail.html:103`: ✕ has only `title`, no `aria-label`
- `menu-edit.ts:193-198` gives every picker the same label, "Add dish". Add the day and meal to it.
- `recipe-list.ts:49` gives every active filter chip the same `aria-label` ("remove filter"). It doesn't contain the visible text, so it is ambiguous and fails WCAG 2.5.3 (label in name).
- `recipe-picker.ts:34-49,51` has `role="combobox"` but no `aria-controls` or `aria-autocomplete="list"`, and the listbox has no `id`.
- `add-to-menu.ts:40-43` has a modal `<dialog>` with no `aria-labelledby`. The `<h2>` needs an `id`.
- Emoji and glyphs are read aloud because they aren't `aria-hidden`:
  - `recipe-card.ts:36,38,40`: "👥 4" is announced as an unlabeled number, and the `title` isn't reliably read
  - `recipe-detail.html:12`, `recipe-list.ts:43,50,59`
  - `timer-dock.ts:62,64`, `plan-confirm.ts:73`
- `timer-dock.ts:46,49-53`: a ringing timer is only a beep, a vibration and a CSS pulse. Nothing is announced to screen readers or shown as text. Add `role="alert"` or a live region.
- `app.html:53`: error toasts use `role="status"`/`polite`. Errors should be `role="alert"`.
- `app.html:22`: `<main id="main">` has no `tabindex="-1"`, so the skip link (`styles.css:54`) doesn't move focus in every browser.
- `styles.css:241,280`: "today" is shown by colour only (`.menu-grid .today`, `.plan-day.today`). Add a text or icon marker.
- Native `confirm()`/`prompt()` are used for destructive actions and have no undo:
  - `recipe-detail.ts:110`, `recipe-history.ts:194`
  - `collection-detail.ts:147`, `households.ts:107`
  - `admin.ts:133`, `menu-edit.ts:400`
  - `shopping-list.ts:306`
- `admin.ts:122` uses `prompt()` to ask for a password, so the password is shown in clear text.

## Touch targets

The minimum should be 44 px, with 24 px as the WCAG 2.2 floor.

- `styles.css:176-177` (≤600 px): the card "add to menu" button is `font-size .7rem; padding .15rem .3rem; min-height: 0`, about 24×20 px. It sits on top of a tappable card, so mis-taps open the recipe instead.
- `styles.css:406` and `:417`: the timer tab is **22 px wide** (below the 24 px floor), and the ✕/↻ column is `1.6rem` ≈ 26 px wide.
- `styles.css:70`: `button.logout` is about 26 px. `.who a` (`:67`) is about 28 px tall.
- `styles.css:131`: `button.icon` is about 28 px tall and 27 px wide. It is used for the ↑ ↓ ✕ triplets at `recipe-form.html:63-65,79-81`, with a `.2rem` gap, so adjacent taps collide.
- `styles.css:200`: the servings stepper ± buttons are 32×~36 px. They are tapped repeatedly in the kitchen.
- `styles.css:113` and `shopping-list.ts:100-107`: the shopping checkbox is the default ~13 px and the label wraps only the name text. A short name like "Sale" is a tiny target on the screen you use one-handed in the shop. `plan-row` (`styles.css:249-251`) already does this correctly, so reuse it.
- `styles.css:129,148`: `button.link` has `.1rem` padding and is about 24 px tall. It is used for "in pantry", "→ home", "bring back" and the chip ✕ buttons (`shopping-list.ts:209`, `recipe-detail.html:103`).
- `styles.css:494`: `.facet-chip` has `min-height: 0` and is about 25 px tall. The removable active-filter chips use it.
- `styles.css:192`: `.dish-play` is about 27 px tall.
- `styles.css:247` and `:489`: `.segmented` buttons are 40 px and `.facet-chips .chip-btn` is 36 px.
- No `touch-action: manipulation` anywhere (only `pan-y` at `:402`). Double-tapping +/− on the stepper can zoom the page on iOS.
- Sticky `:hover` on touch: `styles.css:126,156` (card lift) stays after a tap. Wrap hover styles in `@media (hover: hover)`.

## Contrast

Only the Calderone-light fallback was checked. `themes/README.md` says `make_themes.py` enforces AA, but it may only test text on `--bg` and `--surface`. Check which pairs it covers.

- `--muted` on `--surface-2` is about **4.4:1** (`#7a6a5e` on `#f3ece2`), below 4.5 for small text. Affected: `.badge` (`styles.css:137`, `.75rem`), `.theme-pack`, `.facet-chip`.
- `--accent` on `--accent-soft` is about **4.0:1**. Affected: `button.facet-chip.on` (`:496`), `.filter-toggle.on`, `.facet-hint`.
- `--accent` on `--surface-2` is about **4.2:1**. Affected: `.badge.household` (`:139`) and `.facet-chip.main` (`:495`).
- `--ok` on `--surface-2` is about **4.2:1**. Affected: `.badge.shared` (`:138`).
- `styles.css:40`: `.file-name` is muted at `.75rem` **and** `opacity: .8`. It fails clearly.
- `styles.css:258`: `.plan-row.done { opacity: .7 }` drops the whole row's text below AA. `:422` (`.timer-row.paused .big` at `.55`) dims information, not just decoration.
- No `::placeholder` rule, so the browser default is used on every theme. Add one using a token.
- Text is very small:
  - `styles.css:421,425`: `.68rem` ≈ 11 px, and `.timer-note` carries the notification explanation
  - `:174`: `.7rem` on card meta
  - `:171`: `.8rem` on card titles
  - `:410`: `.72rem`

## Focus states

- `styles.css:119` is a good `:focus-visible` base. Missing is anything that keeps focus clear of the fixed `.bottom-nav` (`:76`), the `.actions.sticky` bar (`:107`) and the timer dock (`:399`). There is no `scroll-padding-bottom` on `html`, so a focused field in the recipe form can sit under the bar and the nav (WCAG 2.4.11).
- `recipe-form.html:70,87` and `:65,81`: after "+ ingredient", "+ step" or ✕, focus isn't managed. The new row doesn't get focus, and after a delete focus falls to `<body>`.
- `login.ts:19`: `autofocus` on the username opens the keyboard on phones and scrolls the card.
- `timer-dock.ts:36`: when the dock opens, focus stays on the tab. This is acceptable but worth checking.

## Forms

- `login.ts:19` and `setup.ts:21`: the username input has no `autocapitalize="none"` or `spellcheck="false"`. iOS capitalizes the first letter, which breaks a case-sensitive login.
- No inline errors anywhere. `login.ts:67`, `shopping-list.ts:270` and the others send errors only to a toast. The fields aren't marked invalid and focus doesn't move to the first error. Only the facet fields show a required `*`; the title and servings fields (`recipe-form.html:5,7`) have `required` but no visible marker.
- `setup.ts:38-46`: the password-confirmation mismatch isn't checked inline.
- `recipe-form.html:52-53,57,59` uses `<datalist>`. The project's own `CLAUDE.md` says phone browsers handle it badly, which is why `recipe-picker.ts` exists. This is inconsistent, so the ingredient and unit fields should use the same picker.
- **No unsaved-changes guard.** Grepping `canDeactivate|beforeunload` finds nothing. Editing a long recipe and tapping one bottom-nav icon loses everything. `menu-edit.ts:214` shows a dirty "•" but doesn't guard navigation either.
- `recipe-form.html:8,58,60`: the qty and note fields have no `inputmode` or `enterkeyhint`. The qty field is text (for "1/2"), so give it a numeric-ish `inputmode`.
- `shopping-list.ts:173-174`: the extra-item qty and unit fields have the same gap.
- `shopping-list.ts:222`: `toPantry(pName); pName = ''` clears the field even if the call fails.

## i18n and layout overflow (German)

- **`styles.css:113` with `shopping-list.ts:100-107`:** `label.check` is `white-space: nowrap` and holds the ingredient name. A long German compound ("Getrocknete Tomaten in Öl, abgetropft") can't wrap, so it pushes the row past 358 px and causes horizontal page scroll. Use `white-space: normal; overflow-wrap: anywhere` here.
- **`styles.css:399-425` with `de.ts:345-346`:** the dock panel is `6.4rem` ≈ 102 px wide (~90 px inner). "Benachrichtigungen" at 11 px is about 100 px, and "Benachrichtigungen einschalten" is a `button.link` that can't break. Both overflow or clip, and the 76-character explanatory sentence turns into a tall sliver. Add `overflow-wrap: anywhere; hyphens: auto` and consider a wider panel on German.
- `styles.css:201-209`: `table.ing td:first-child` and `.steps li p` have no `overflow-wrap`/`hyphens`, so long compounds in the 17 px reading font can overflow.
- `styles.css:171`: card titles are clamped to 3 lines at 12.8 px, three cards per row (~114 px each), with no full-title access. Long German names get cut off.
- `shopping-list.ts:109` writes `{{ qty }} {{ unit }}` with a normal space, so "200" and "g" can wrap apart. Use a non-breaking space.
- `de.ts:459` `shop.this_week: 'Einkaufswoche'` reads as "shopping week", not "this week". `de.ts:432` `menus.this_week: 'diese'` gives the tab "Woche 2 · diese". Both read oddly. Check the `fr`/`en` equivalents too.
- `styles.css:219-223`: at ≤700 px, `.note` spans all columns, which likely leaves an empty third cell beside qty and unit. Check this in a browser.
- `styles.css:434-438`: `.wheel-overlay` is `justify-content: center` with `overflow-y: auto`. On a short viewport (landscape, keyboard) the top content (title, total) is clipped and can't be scrolled to. Use `margin-block: auto` on the content instead.
- `styles.css:401`: `top: 34vh` should be `dvh`, to match the rest of the file.

## Navigation, state, safe areas

- Shopping space and week (`shopping-list.ts:264`) and the menu week tab (`menu-edit.ts:130`) are not in the URL. Back and refresh lose them, while the recipe filters are in the URL (good).
- `styles.css:351-352`: `dialog.sheet` has no `overscroll-behavior: contain`, so the page behind scrolls.
- `index.html:7`: the viewport has no `viewport-fit=cover`, so every `env(safe-area-inset-*)` (`styles.css:78,359,437`) resolves to 0. There is no manifest either. If you want an installed PWA, add both.
- `dish-stage.ts:21` puts `(click)="play()"` on a non-interactive host. The 3D button covers keyboard users, so this is minor.

## The 5 changes that would help most

1. **Fix the tap targets on the busiest screens.** Cover the shopping checkbox (full-row label, ≥44 px, 1.25 rem box like `plan-row`), the 3-up card "+" button, the stepper, the `button.icon` ↑↓✕ triplets, the timer tab and ✕ column, and the logout button. Add `touch-action: manipulation` globally. This is the largest usability gain on a phone.
2. **Stop overflow with German text.** Remove `nowrap` from `label.check` in the shopping list, add `overflow-wrap`/`hyphens` to the timer panel, ingredient table and step text, and show full card titles somewhere. I think this is the likeliest cause of broken layout at 390 px.
3. **Add an unsaved-changes guard and inline errors to the forms.** Use a `canDeactivate` guard for the recipe form and the dirty menu editor. Add `aria-invalid` and per-field messages with focus on the first error. Also add `autocapitalize="none" spellcheck="false"` on the username fields and drop `autofocus` on mobile.
4. **Make the repeated controls and the dock accessible.** Include the dish, ingredient or filter name in each ✕, servings and picker label, and mark emoji `aria-hidden`. Announce a ringing timer (`role="alert"` or a live region) and use `role="alert"` for error toasts. Fix the tab semantics and the combobox/dialog ARIA.
5. **Fix contrast, focus clearance and the dialogs.** Make `--muted`, `--accent` and `--ok` AA on `--surface-2` and `--accent-soft`, and drop the `opacity` tricks on text. Check that `make_themes.py` tests those pairs. Add `scroll-padding-bottom: calc(var(--nav-h) + 6rem)`. Replace native `confirm()`/`prompt()` with the existing sheet dialog, using an undo toast for deletes. That also removes the clear-text password prompt in admin.

---

# Triage (2026-10-21)

Buckets: **A** fix now, **B** fold into the redesign, **C** skip. Effort: S under an hour, M a few hours, L a day or more. Same issue in several files is one row.

## A) Fix now

| id | short title | bucket | files | effort |
|----|-------------|--------|-------|--------|
| A1 | Shopping item names can't wrap (`nowrap`), so long German names cause horizontal page scroll | A | `styles.css:113`, `shopping-list.ts:100-107` | S |
| A2 | Shopping checkbox is ~13 px and only the name text is tappable; make the row the target (reuse `plan-row`) | A | `styles.css:113,249-251`, `shopping-list.ts:100-107` | S |
| A3 | Timer dock overflows in German ("Benachrichtigungen" in a ~90 px column) and its note is 11 px | A | `styles.css:399-425`, `de.ts:345-346` | S |
| A4 | Long words overflow the ingredient table and step text (no `overflow-wrap`/`hyphens`) | A | `styles.css:201-209` | S |
| A5 | Qty and unit can wrap apart; use a non-breaking space | A | `shopping-list.ts:109` | S |
| A6 | Controls under 44 px: `button.icon`, `button.link`, servings stepper, logout, `.who a`, `.facet-chip`, `.dish-play`, `.segmented`, `.chip-btn` | A | `styles.css:67,70,129,131,148,192,200,247,489,494` | M |
| A7 | Timer tab is 22 px wide and the ✕/↻ column ~26 px | A | `styles.css:406,417` | M |
| A8 | Card "add to menu" button is ~24×20 px on the 3-up grid and sits over a tappable card | A | `styles.css:176-177`, `add-to-menu.ts:32-37` | S |
| A9 | No `touch-action: manipulation`; double-tapping +/− zooms on iOS | A | `styles.css` (global rule) | S |
| A10 | Repeated ✕, move, servings and picker controls have no context in their label | A | `menu-edit.ts:167-198`, `recipe-form.html:63-65,79-81`, `shopping-list.ts:149-155,209-216`, `recipe-detail.html:103` | M |
| A11 | Active-filter chips share one `aria-label` that omits the visible text (WCAG 2.5.3) | A | `recipe-list.ts:49` | S |
| A12 | Emoji/glyphs not `aria-hidden`; servings "👥 4" is an unlabeled number to screen readers | A | `recipe-card.ts:36-40`, `recipe-detail.html:12`, `recipe-list.ts:43,50,59`, `timer-dock.ts:62,64`, `plan-confirm.ts:73` | S |
| A13 | Ringing timer is not announced; error toasts use `role="status"` instead of `alert` | A | `timer-dock.ts:46-53`, `app.html:53` | S |
| A14 | ARIA patterns incomplete: combobox (`aria-controls`/`aria-autocomplete`), dialog `aria-labelledby`, fake `tablist` | A | `recipe-picker.ts:34-51`, `add-to-menu.ts:43`, `shopping-list.ts:30`, `menu-edit.ts:123` | M |
| A15 | Skip link target `<main>` has no `tabindex="-1"` | A | `app.html:22` | S |
| A16 | `.table { display: block }` strips table semantics; scroll region not keyboard-reachable | A | `styles.css:259`, `admin.ts:17`, `recipe-history.ts:40` | S |
| A17 | Admin sets a password through `prompt()`, so it is shown in clear text | A | `admin.ts:122` | M |
| A18 | No unsaved-changes guard; one nav-icon tap discards a long recipe edit | A | `recipe-form.ts`, `menu-edit.ts:214` (plus a `canDeactivate` guard) | M |
| A19 | Login `autofocus` opens the keyboard; username gets auto-capitalized on iOS | A | `login.ts:19`, `setup.ts:21` | S |
| A20 | Required fields have no visible marker; password mismatch not checked inline | A | `recipe-form.html:5,7`, `setup.ts:38-46` | S |
| A21 | Ingredient and unit fields use `<datalist>`, which the project says is poor on phones; use the picker | A | `recipe-form.html:52-59` | M |
| A22 | No focus management when adding or removing ingredient/step rows | A | `recipe-form.html:65,70,81,87` | M |
| A23 | Focused fields can sit under the sticky action bar, bottom nav and dock; no `scroll-padding-bottom` | A | `styles.css` (`html` rule), `:76,107,399` | S |
| A24 | Contrast gate: check that `make_themes.py` tests text on `--surface-2`/`--accent-soft`/`--ok`, and drop `opacity` on text | A | `tools/make_themes.py`, `styles.css:40,258,422` | M |
| A25 | Wheel overlay clips its top on short viewports (`justify-content: center` + scroll); dock uses `vh` not `dvh` | A | `styles.css:434-438,401` | S |
| A26 | Bottom-sheet dialog lets the page behind scroll | A | `styles.css:351-352` | S |
| A27 | Odd German labels: "Einkaufswoche" for "this week", "diese" on the week tab (check it/en/fr too) | A | `de.ts:459,432` | S |
| A28 | Recipe-editor ingredient row likely leaves an empty grid cell at ≤700 px (verify in a browser first) | A | `styles.css:219-223` | S |
| A29 | Pantry input clears even if the request failed | A | `shopping-list.ts:222` | S |
| A30 | Shopping space/week and menu week tab are not in the URL, so back and refresh lose them | A | `shopping-list.ts:264`, `menu-edit.ts:130` | M |

## B) Fold into the redesign

Acceptance notes carry over from the audit so the redesign doesn't reintroduce the problem.

| id | short title | bucket | files | effort |
|----|-------------|--------|-------|--------|
| B1 | The specific failing token values (`--muted`, `--accent`, `--ok` on `--surface-2`/`--accent-soft`, ~4.0-4.4:1); new tokens must pass the A24 gate | B | `styles.css:5-18`, `themes/*` (generated) | S |
| B2 | `::placeholder` colour as a token | B | `styles.css` | S |
| B3 | Type scale: nothing below 12 px (`.68`-`.8rem` used at `:171,174,410,421,425`) | B | `styles.css` | M |
| B4 | 3-up phone recipe cards: 3-line title clamp, hidden meta, tiny type | B | `styles.css:164-178`, `recipe-card.ts` | L |
| B5 | "Today" is colour-only in the menu grid and plan; add a text or icon marker | B | `styles.css:241,280,290`, `menu-edit.ts:146,150`, `week-plan.ts` | S |
| B6 | Sticky `:hover` on touch (card lift, border); gate on `@media (hover: hover)` | B | `styles.css:126,156` | S |
| B7 | Replace native `confirm()` with the sheet dialog plus an undo toast | B | `recipe-detail.ts:110`, `recipe-history.ts:194`, `collection-detail.ts:147`, `households.ts:107`, `admin.ts:133`, `menu-edit.ts:400`, `shopping-list.ts:306` | L |
| B8 | Inline field errors with `aria-invalid` and focus on the first error, replacing toast-only errors | B | all forms (`login.ts`, `setup.ts`, `recipe-form.html`, `shopping-list.ts`, ...) | L |
| B9 | `viewport-fit=cover` and manifest, so `env(safe-area-inset-*)` works; decide together with the nav redesign | B | `index.html:7`, `styles.css:78,359,437` | S |

## C) Skip

| id | short title | bucket | files | effort |
|----|-------------|--------|-------|--------|
| C1 | Click handler on the `dish-stage` host | C | `dish-stage.ts:21` | - |
| C2 | Focus stays on the dock tab when the dock opens | C | `timer-dock.ts:36` | - |
| C3 | `inputmode`/`enterkeyhint` on quantity fields | C | `recipe-form.html:8,58,60`, `shopping-list.ts:173-174` | - |

Reasons:

- **C1:** the "3D ⟳" button (`dish-stage.ts:30`) is the keyboard and screen-reader path, so the host click is only a touch convenience. Not a defect.
- **C2:** the audit itself called this acceptable. The tab is a disclosure button with `aria-expanded`, and the closed panel is `inert`. Moving focus into the panel would be worse.
- **C3:** quantity fields are text on purpose, to allow "1/2" and "q.b.". No phone numeric keypad has "/", so `inputmode="decimal"` would make entry harder. `enterkeyhint` is cosmetic. (`servings`/`time` are already `type="number"`.)
- Nothing in the audit concerns the PHP backend, and no finding is desktop-only (all are phone-relevant or shared), so C is small. The only server-adjacent item is A17, where the fix is front-end only.

## Notes on the split

- **Contrast** is split on purpose. The gate (A24) is fix-now because it protects every theme, including the redesign's new tokens. The individual hex values (B1) are redesign work and not worth patching in the old palette.
- **Touch targets** stay in A even though they are styling, because the 44 px minimum is a usability floor. Where the redesign changes a component, build to 44 px from the start. A6, A7 and A8 then reduce to a quick check.
- **Suggested order:** A1-A5 (overflow and shopping, the phone-in-the-shop path), then A6-A9, A13, A23, A24, then the remaining labels/ARIA (A10-A16), then forms (A17-A22), then A25-A30.
