# Ideas

Parked and adopted design ideas for Il Calderone. The adopted direction is specified in `docs/design.md`; this file keeps the reasoning and the ones not (yet) taken. Keep one section per idea, newest status first in each section.

All three directions build on the same identity: the hand-drawn 8-bit dish icons (128×128 px, 4 px art-pixels, always shown at integer scales: 96/128/160/192/256 px, `image-rendering: pixelated`) and the voxel dishes (`shared/dish-stage.ts`).

## 1. La dispensa (the pantry shelf)

**Status: adopted** (light theme `dispensa-light` is the default; see `docs/design.md`).

- **Idea:** the app is a pantry shelf where each dish stands as a specimen of its own pixel icon, and the pixel grid sets spacing, radii and corners.
- **Type:** Bricolage Grotesque (titles, UI, tabular figures), Literata (reading). A pixel face for digits was tried (Pixelify Sans) and dropped: 5 reads as S, 9 as 8.
- **Palette:** ground `#F2F4EC`, tile `#E6EBDB`, ink `#1B2A1C`, muted `#4D5C4A`, basil `#2B6A1D` (links), saffron `#F2B01E` (the one primary action, ink text), danger `#A7231B`.
- **Layout:** two-up grid of 160 px icons with the full title at 16 px; "+" in a row under the title; menu as seven day rows with a 96 px icon; shopping as two-line rows.
- **Recipe page:** voxel dish on a flat field; title, time, one diet line, two buttons ("Cucina", "Aggiungi"); filter chips folded into one "Dettagli" row; ingredients in two columns.

## 2. Un colore per piatto (one colour per dish)

**Status: parked.** Boldest, but needs per-recipe colour logic.

- **Idea:** every recipe owns one flat colour field taken from its own icon; the app is a stack of full-bleed colour blocks with very large type.
- **Type:** Archivo (width axis: condensed heavy titles, normal UI), Literata for steps.
- **Palette:** six dish fields with a fixed ink each. Ink `#151515` on saffron `#F2B01E` (9.6:1), pumpkin `#EE8A3A` (7.2:1), lime `#A8D36F` (10.6:1), flour `#F3F1EA` (16.2:1). White on aubergine `#5A2A4B` (11.2:1), blue `#2D5B9C` (6.8:1), tomato `#BF3326` (5.7:1), basil `#2B6A1D` (6.6:1). Each recipe snaps to the nearest field.
- **Layout:** list as full-width colour bands (~120 px) with the icon at 128 px on the right and a 28 px title; menu days as colour-coded rows; shopping grouped by recipe colour.
- **Recipe page:** the whole top is the dish's field, voxel dish large, 40 px title; ingredients on a white sheet; each step a full-width block in the same colour family. Colour sampled once from the icon and cached (no dependency).
- **To revisit:** a per-recipe accent only (saffron/basil swap on the recipe page header) would be a cheap first step inside direction 1.

## 3. Cucina di sera (kitchen at night)

**Status: partly adopted.** The dark palette became `dispensa-dark` (colours only); the cooking reading mode is built into the recipe page (not a separate step-by-step wizard).

- **Idea:** a dark-first mode for cooking with wet hands: big type, timers the loudest thing on screen.
- **Type:** Atkinson Hyperlegible Next, tabular bold figures for timer digits.
- **Palette:** ground `#121212` (true neutral, no navy), surface `#1D1D1D`, surface-2 `#272727`, ink `#F1EEE6` (16.2:1), muted `#A9A59B` (≥ 6.1:1), saffron `#F2B01E` (actions, timers), lime `#9AD36B` (done), danger `#FF8F80`.
- **Layout:** two-up 160 px icons; shopping as a 56 px-row checklist; menu highlights tonight's dish.
- **Not taken:** the exclusive one-step-at-a-time view (while cooking you want the previous and next steps and the ingredients in sight), and Atkinson as a second UI face.

## Other ideas

- Per-recipe colour sampled from the icon at runtime via `<canvas>` (direction 2 light).
- Pixel digits: tried Pixelify Sans in the timer strip, illegible (5/S, 9/8). Maybe for non-critical decoration only.
- Screen Wake Lock while the cooking mode is open (adopted in the plan; iOS support varies).
- Timer detection in step text ("10 Minuten") as an inline button (adopted for the cooking mode).
- Per-step ingredient matching (show only the quantities a step uses). Fragile without data changes: would need an `ingredients` list per step in the recipe schema.
- Timer strip above the tab bar: tried in round 1, dropped (the edge tab with its 5 slots was preferred). A "More" sheet in the tab bar: tried, dropped (hid Sammlungen and Tagebuch).
- Swipe on shopping rows (tick, "always at home") instead of a row menu.
- Photos of real dishes are deliberately not part of the identity; drawn icons and voxels stay the picture language.
