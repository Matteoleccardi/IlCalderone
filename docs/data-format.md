# Data format

All data is UTF-8, pretty-printed JSON under the data folder (default `public/data/`). The machine-readable definitions
are in [`schema/`](../schema). `python tools/validate.py <data folder>` checks a whole folder against them, and also checks
references and the variant graph.

```
data/
  users.json                     calderone-users/1        accounts (password hashes from PHP password_hash)
  households.json                calderone-households/1   family groups and their members
  recipes/<id>.json              calderone-recipe/1       one file per recipe
  history/<id>/<rev>.json        calderone-recipe/1       earlier versions of a recipe (full copies)
  media/<id>.jpg|png|webp                                 dish photos
  collections/<id>.json          calderone-collection/1
  meallog/<userId>/<YYYY-MM>.json  calderone-meallog/1    one file per user per month
  menus/<id>.json                calderone-menu/1         one file per menu
  pantry/<space>.json            calderone-pantry/1       ingredients always at home, per space
  shopping/<space>/<monday>.json calderone-shopping/1     ticks, extra items and moves of one week's list
  index/recipes.json             derived: summaries for list/search (delete it any time, it is rebuilt)
  sessions/, ratelimit.json, .lock                        runtime files, safe to delete
```

Every file has a `"format": "<name>/<version>"` field, so a later version of the app can migrate old files.

## Ids and permissions

- Ids are 32 lowercase hex characters, either random or derived from a UUID. A file name equals its id.
- Recipes and collections carry `owner` (a user id), `visibility` (`private` | `household` | `shared`) and `household`
  (a household id when the visibility is `household`, otherwise `null`).
- A user can see an item if they own it, if it is `shared`, or if it is `household` and they belong to that household.
  The owner can edit it; household items can be edited by every member of the household too. Deleting a recipe,
  changing who can see it and changing its variant links stay with the owner.
- **Spaces.** Menus, pantries and shopping lists belong to a *space*: a user's personal space (an implicit household
  with just them, file key `u-<userId>`) or a household (`h-<householdId>`). Private menus are in the owner's personal
  space; household menus (`visibility: "household"`) in the household's.

## Recipe (`calderone-recipe/1`)

The same shape is used for the stored files and for **exchange files** (import/export). Exchange files leave out `owner`,
`visibility`, `household`, `created` and `updated`, and may carry the photo inline as `photo_data` (a `data:image/...;base64,` URI).

```json
{
  "format": "calderone-recipe/1",
  "id": "b2f1c6d3e4a5b6c7d8e9f0a1b2c3d4e5",
  "title": "Spaghetti aglio, olio e pangrattato tostato",
  "servings": 2,
  "time_minutes": 20,
  "category": "Primo",
  "tags": ["veloce"],
  "ingredients": [
    {"name": "Spaghetti", "qty": 180, "unit": "g", "optional": false, "note": ""},
    {"name": "Sale", "qty": null, "unit": "q.b.", "optional": false, "note": ""}
  ],
  "steps": [{"title": "Cuocete la pasta", "text": "…"}],
  "notes": "",
  "taken_from": "",
  "photo": "b2f1c6d3e4a5b6c7d8e9f0a1b2c3d4e5.jpg",
  "parents": [{"id": "a1e0b5c2d3f4a5b6c7d8e9f0a1b2c3d4", "kind": "variant", "note": ""}],
  "owner": "…", "visibility": "shared", "household": null,
  "created": "2026-10-18T19:11:17Z", "updated": "2026-10-18T19:11:17Z",
  "rev": 1, "updated_by": "…"
}
```

- `taken_from` says where the recipe comes from (a book, a site, grandma); it is optional. The app shows
  "Source: <owner's name>" followed by "· from <taken_from>" when it is set. Files before v0.3 called this field
  `source`; it is still accepted on import and read from old files.
- `rev` is the version number and `updated_by` who made the last change. Every in-place edit first copies the current
  file to `history/<id>/<rev>.json` and then increases `rev` (at most `history_max` versions are kept, see `config.php`).
  Restoring an old version saves its content as a new version, so nothing is lost. Photos are not versioned.
  Variants are separate recipes, not versions.

- `qty` is the amount for `servings` people. `null` means *q.b.* (to taste); the app scales numeric quantities.
- Units are free text. The conventions used so far are `g`, `ml`, `p.` (pieces), `tbs`, `spicchi`, `foglie`, `cm` and `q.b.`.
  Every spoon measure is written as `tbs` (1 teaspoon = 1/3 tbs), so the same ingredient adds up across recipes.
- `parents` holds the edges of the **variant graph** (parent → this recipe). `kind` is `variant`, `adaptation` or `inspired`.
  The graph must stay acyclic, and an edge may point to a recipe the reader cannot see (it is then simply not shown).
- **Import is idempotent**: a recipe whose `id` already exists is skipped. Parents are linked after all files are imported,
  so the order doesn't matter.

## Meal log entry

```json
{"id": "2026-10-18-3fa9c01b22aa", "day": "2026-10-18", "meal": "cena", "recipe": "…", "title": "Spaghetti…",
 "servings": 2, "note": "", "created": "2026-10-18T19:30:00Z"}
```

`title` is a snapshot, so the diary still reads correctly after the recipe is deleted. `recipe` is `null` for free-text entries.
The id starts with the month, which tells the app which file the entry is in. Members of a household can read each
other's diaries; only the author can add or delete entries.

## Menu (`calderone-menu/1`)

```json
{"format": "calderone-menu/1", "id": "…", "name": "Cene autunnali", "notes": "",
 "owner": "…", "visibility": "household", "household": "…",
 "start": "2026-10-12", "weeks": 4, "meals": ["cena"], "season": {"from": "10-01", "to": "03-31"}, "active": true,
 "items": [{"week": 1, "day": 1, "meal": "cena", "recipe": "…", "text": "", "servings": 4},
           {"week": 1, "day": 5, "meal": "cena", "recipe": null, "text": "Pizza fuori", "servings": null}],
 "created": "…", "updated": "…", "updated_by": "…"}
```

- The cycle of `weeks` weeks starts on the Monday `start` and repeats for ever (also backwards). `day` 1 is Monday.
- `meals` are stored keys: `colazione`, `pranzo`, `cena`, `spuntino` (breakfast, lunch, dinner, snack).
- `season` (optional, `MM-DD`, may wrap around the new year) and `active` switch the menu on and off.
- `servings: null` means the recipe's own servings. A cell may hold several items.
- A household menu may only contain recipes every member can see (shared ones, or that household's).

## Shopping list and pantry

The list itself is **not stored**: it is computed from the menus of a space for one week (Monday to Sunday). Every
ingredient of every planned recipe is scaled to the item's servings and summed per lowercase name + unit; `q.b.`
items are kept apart, and pantry items are left out. What people do on the list is stored per week:

```json
{"format": "calderone-shopping/1", "week": "2026-10-19",
 "checked": ["pasta|g", "x:3fa9c01b22aa"],
 "extra": [{"id": "3fa9c01b22aa", "name": "Detersivo", "qty": null, "unit": "", "note": "", "by": "…", "added": "…"}],
 "moved": {"broccoli|g": "<householdId>"}}
```

- Item keys are `<lowercase name>|<lowercase unit>`; extra items use `x:<id>`.
- `moved` exists in personal lists only: those items appear (live) in that household's list instead.

`pantry/<space>.json` = `{"format": "calderone-pantry/1", "items": [{"name": "Sale", "added": "…", "by": "…"}]}`.
