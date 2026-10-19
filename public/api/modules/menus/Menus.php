<?php
declare(strict_types=1);

/**
 * Menus: a cycle of N weeks that repeats forever from a start Monday (like the spreadsheet's 4-week dinner menu).
 *  data/menus/<id>.json = {format: calderone-menu/1, id, name, notes, owner, visibility (private|household), household,
 *                          start (a Monday), weeks, meals[], season {from "MM-DD", to "MM-DD"}|null, active,
 *                          items[{week 1..N, day 1..7 (Mon..Sun), meal, recipe|null, text, servings|null}], …}
 * A private menu belongs to its owner's personal space, a household menu to the household (every member can edit it).
 * Several menus can be active on the same day: the plan then shows every option.
 */
final class Menus
{
    public const FORMAT = 'calderone-menu/1';
    public const MEALS = ['colazione', 'pranzo', 'cena', 'spuntino'];
    public const MAX_WEEKS = 12;

    private ?array $all = null;

    public function __construct(private App $app, private Recipes $recipes)
    {
    }

    /** @return array<string,array> id => menu */
    public function all(): array
    {
        if ($this->all === null) {
            $this->all = [];
            foreach ($this->app->store->list('menus') as $id) {
                if ($m = $this->app->store->read("menus/{$id}.json")) {
                    $this->all[$m['id']] = $m;
                }
            }
            uasort($this->all, fn($a, $b) => strcmp(Util::lower($a['name']), Util::lower($b['name'])));
        }
        return $this->all;
    }

    public function save(array $m): array
    {
        $this->app->store->write("menus/{$m['id']}.json", $m);
        $this->all = null;
        return $m;
    }

    public function delete(array $m): void
    {
        $this->app->store->delete("menus/{$m['id']}.json");
        $this->all = null;
    }

    public function load(array $user, string $id, bool $edit = false): array
    {
        $m = Util::isId($id) ? ($this->all()[$id] ?? null) : null;
        if (!$m || !$this->app->canView($user, $m)) {
            throw new HttpError(404, 'menu_not_found');
        }
        if ($edit && !$this->app->canEdit($user, $m)) {
            throw new HttpError(403, 'menu_edit_denied');
        }
        return $m;
    }

    /** Menus the user can see: their private ones and those of their households. */
    public function visible(array $user): array
    {
        return array_values(array_filter($this->all(), fn($m) => $this->app->canView($user, $m)));
    }

    /** Menus that belong to a space (see App::space): the user's private menus, or a household's menus. */
    public function ofSpace(array $user, array $space): array
    {
        return array_values(array_filter($this->all(), fn($m) => $space['household'] === null
            ? $m['visibility'] === 'private' && $m['owner'] === $user['id']
            : $m['visibility'] === 'household' && $m['household'] === $space['household']));
    }

    /**
     * May this recipe appear in this menu? Everyone who uses the menu must be able to see it: in a private menu, any
     * recipe its owner can see; in a household menu, shared recipes and the recipes of that household.
     */
    public function fits(array $menu, array $recipe): bool
    {
        if ($menu['visibility'] === 'household') {
            return $recipe['visibility'] === 'shared'
                || ($recipe['visibility'] === 'household' && $recipe['household'] === $menu['household']);
        }
        $owner = $this->app->auth->findUser($menu['owner']);
        return $owner !== null && $this->app->canView($owner, $recipe);
    }

    // ---------- calendar ----------

    public static function inSeason(array $m, string $day): bool
    {
        $s = $m['season'] ?? null;
        if (!$s) {
            return true;
        }
        $md = substr($day, 5);
        return $s['from'] <= $s['to'] ? ($md >= $s['from'] && $md <= $s['to']) : ($md >= $s['from'] || $md <= $s['to']);
    }

    public static function activeOn(array $m, string $day): bool
    {
        return !empty($m['active']) && self::inSeason($m, $day);
    }

    /** [week, day] of the cycle that falls on $day (the cycle also extends backwards before the start). */
    public static function slot(array $m, string $day): array
    {
        $len = $m['weeks'] * 7;
        $i = ((Util::dayNumber($day) - Util::dayNumber($m['start'])) % $len + $len) % $len;
        return [intdiv($i, 7) + 1, $i % 7 + 1];
    }

    /** Items of the menu for that date (empty when the menu is off or out of season). */
    public static function itemsOn(array $m, string $day): array
    {
        if (!self::activeOn($m, $day)) {
            return [];
        }
        [$w, $d] = self::slot($m, $day);
        return array_values(array_filter($m['items'], fn($it) => $it['week'] === $w && $it['day'] === $d));
    }

    /**
     * What is planned from $from for $days days, over all menus the user can see:
     * [{date, meals: [{meal, options: [{menu, menu_name, space, space_name, recipe, title, available, photo, text, servings}]}]}]
     */
    public function plan(array $user, string $from, int $days): array
    {
        $menus = $this->visible($user);
        $idx = $this->recipes->index();
        $hh = [];
        foreach ($this->app->households() as $h) {
            $hh[$h['id']] = $h['name'];
        }
        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $day = Util::addDays($from, $i);
            $byMeal = [];
            foreach ($menus as $m) {
                foreach (self::itemsOn($m, $day) as $it) {
                    $s = $it['recipe'] ? ($idx[$it['recipe']] ?? null) : null;
                    $ok = $s && $this->app->canView($user, $s);
                    $byMeal[$it['meal']][] = [
                        'menu' => $m['id'], 'menu_name' => $m['name'],
                        'space' => $m['visibility'] === 'household' ? $m['household'] : 'me',
                        'space_name' => $m['visibility'] === 'household' ? ($hh[$m['household']] ?? null) : null,
                        'recipe' => $it['recipe'], 'title' => $ok ? $s['title'] : null, 'available' => $ok,
                        'photo' => $ok && $s['photo'], 'updated' => $ok ? $s['updated'] : null,
                        'text' => $it['text'], 'servings' => $it['servings'] ?? ($ok ? $s['servings'] : null),
                    ];
                }
            }
            $meals = [];
            foreach (self::MEALS as $meal) {
                if (!empty($byMeal[$meal])) {
                    $meals[] = ['meal' => $meal, 'options' => $byMeal[$meal]];
                }
            }
            $out[] = ['date' => $day, 'meals' => $meals];
        }
        return $out;
    }

    // ---------- exchange (import/export) ----------

    /** A menu as an exchange file entry: no owner/household; recipe items also carry the title (to match elsewhere). */
    public function toExchange(array $m): array
    {
        $idx = $this->recipes->index();
        $items = array_map(fn($it) => [
            'week' => $it['week'], 'day' => $it['day'], 'meal' => $it['meal'], 'recipe' => $it['recipe'],
            'title' => $it['recipe'] ? ($idx[$it['recipe']]['title'] ?? null) : null,
            'text' => $it['text'], 'servings' => $it['servings'] ?? null,
        ], $m['items']);
        return ['format' => self::FORMAT, 'id' => $m['id'], 'name' => $m['name'], 'notes' => $m['notes'] ?? '',
            'start' => $m['start'], 'weeks' => $m['weeks'], 'meals' => $m['meals'], 'season' => $m['season'] ?? null,
            'active' => $m['active'], 'items' => $items];
    }

    /**
     * Import exchange-format menus into the user's space or a household. Existing ids are skipped (idempotent).
     * Each recipe item is matched by id, else by title (ignoring case) among the recipes that fit the menu;
     * a recipe that cannot be found becomes a text dish with its title, so a menu is never lost for one dish.
     */
    public function import(array $user, array $items, string $visibility, ?string $household): array
    {
        return $this->app->store->locked(function () use ($user, $items, $visibility, $household) {
            $created = [];
            $msgs = [];
            $idx = $this->recipes->index();
            foreach ($items as $d) {
                if (!is_array($d)) {
                    $msgs[] = ['code' => 'import_invalid_item', 'params' => []];
                    continue;
                }
                $name = is_string($d['name'] ?? null) ? $d['name'] : '?';
                if (($d['format'] ?? self::FORMAT) !== self::FORMAT) {
                    $msgs[] = ['code' => 'import_format', 'params' => ['title' => $name]];
                    continue;
                }
                $id = isset($d['id']) && is_string($d['id']) && Util::isId($d['id']) ? $d['id'] : null;
                if ($id && isset($this->all()[$id])) {
                    $msgs[] = ['code' => 'import_menu_exists', 'params' => ['title' => $name]];
                    continue;
                }
                try {
                    $now = Util::now();
                    $base = ['format' => self::FORMAT, 'id' => $id ?? Util::id(), 'owner' => $user['id'], 'items' => []];
                    $m = $this->clean($user, ['visibility' => $visibility, 'household' => $household, 'items' => []] + $d, $base);
                    // match the dishes now that the menu's space is known
                    $byTitle = [];
                    foreach ($idx as $s) {
                        if ($this->app->canView($user, $s) && $this->fits($m, $s)) {
                            $byTitle[Util::lower(Util::squash($s['title']))] ??= $s['id'];
                        }
                    }
                    $dishes = [];
                    foreach (is_array($d['items'] ?? null) ? $d['items'] : [] as $it) {
                        if (!is_array($it)) {
                            continue;
                        }
                        $rid = is_string($it['recipe'] ?? null) ? $it['recipe'] : null;
                        $title = is_string($it['title'] ?? null) ? Util::squash($it['title']) : '';
                        $ok = $rid && isset($idx[$rid]) && $this->app->canView($user, $idx[$rid]) && $this->fits($m, $idx[$rid]);
                        if (!$ok && ($rid || $title !== '')) {
                            $rid = $byTitle[Util::lower($title)] ?? null;
                            if (!$rid) {
                                $msgs[] = ['code' => 'import_menu_recipe_text', 'params' => ['menu' => $m['name'], 'title' => $title ?: '?']];
                                $it['text'] = $title ?: (string) ($it['text'] ?? '');
                            }
                        }
                        $dishes[] = ['recipe' => $rid] + $it;
                    }
                    $m['items'] = $this->cleanItems($user, $dishes, $m);
                    $m = ['format' => self::FORMAT] + $m + ['created' => $now, 'updated' => $now, 'updated_by' => $user['id']];
                    $this->save($m);
                    $created[] = $m['id'];
                } catch (HttpError $e) {
                    $msgs[] = ['code' => 'import_failed', 'params' => ['title' => $name, 'reason' => $e->errorCode] + $e->params];
                }
            }
            return ['created' => $created, 'messages' => $msgs];
        });
    }

    // ---------- input ----------

    /** Clean the editable fields of a menu sent by the client; $m is the current menu (or the defaults of a new one). */
    public function clean(array $user, array $d, array $m): array
    {
        $str = fn($v, int $max) => is_scalar($v) ? Util::clip(trim((string) $v), $max) : '';
        $name = Util::squash($str($d['name'] ?? $m['name'] ?? '', 120));
        if ($name === '') {
            throw new HttpError(400, 'menu_name_required');
        }
        $m['name'] = $name;
        $m['notes'] = $str($d['notes'] ?? $m['notes'] ?? '', 2000);

        // who it belongs to: only the creator moves a menu between their personal space and a household
        if (!isset($m['owner']) || $m['owner'] === $user['id']) {
            $vis = ($d['visibility'] ?? $m['visibility'] ?? 'private') === 'household' ? 'household' : 'private';
            [$vis, $hh] = $this->app->cleanScope($user, $vis, $d['household'] ?? $m['household'] ?? null);
            $m['visibility'] = $vis;
            $m['household'] = $hh;
        }

        $start = $str($d['start'] ?? $m['start'] ?? '', 10);
        $m['start'] = Util::isDate($start) ? Util::monday($start) : Util::monday(date('Y-m-d'));
        $m['weeks'] = max(1, min(self::MAX_WEEKS, (int) ($d['weeks'] ?? $m['weeks'] ?? 4)));
        $meals = is_array($d['meals'] ?? null) ? $d['meals'] : ($m['meals'] ?? ['cena']);
        $m['meals'] = array_values(array_filter(self::MEALS, fn($x) => in_array($x, $meals, true))) ?: ['cena'];
        $m['active'] = (bool) ($d['active'] ?? $m['active'] ?? true);

        $season = array_key_exists('season', $d) ? $d['season'] : ($m['season'] ?? null);
        $md = fn($v) => is_string($v) && preg_match('/^(\d\d)-(\d\d)$/', $v, $x) && checkdate((int) $x[1], (int) $x[2], 2000) ? $v : null;
        $from = is_array($season) ? $md($season['from'] ?? null) : null;
        $to = is_array($season) ? $md($season['to'] ?? null) : null;
        $m['season'] = $from && $to ? ['from' => $from, 'to' => $to] : null;

        if (array_key_exists('items', $d)) {
            $m['items'] = $this->cleanItems($user, is_array($d['items']) ? $d['items'] : [], $m);
        } else {
            // weeks/meals may have shrunk
            $m['items'] = array_values(array_filter($m['items'] ?? [], fn($it) => $it['week'] <= $m['weeks'] && in_array($it['meal'], $m['meals'], true)));
        }
        return $m;
    }

    private function cleanItems(array $user, array $items, array $m): array
    {
        $idx = $this->recipes->index();
        $before = array_flip(array_filter(array_column($m['items'] ?? [], 'recipe')));
        $out = [];
        foreach (array_slice($items, 0, 2000) as $it) {
            if (!is_array($it)) {
                continue;
            }
            $week = (int) ($it['week'] ?? 0);
            $day = (int) ($it['day'] ?? 0);
            $meal = (string) ($it['meal'] ?? '');
            if ($week < 1 || $week > $m['weeks'] || $day < 1 || $day > 7 || !in_array($meal, $m['meals'], true)) {
                continue;
            }
            $rid = is_string($it['recipe'] ?? null) && $it['recipe'] !== '' ? $it['recipe'] : null;
            $text = Util::squash(is_scalar($it['text'] ?? null) ? Util::clip((string) $it['text'], 120) : '');
            if ($rid !== null) {
                $s = $idx[$rid] ?? null;
                // a recipe already in the menu may stay even if it is no longer visible (it is then skipped)
                if (!isset($before[$rid]) && (!$s || !$this->app->canView($user, $s) || !$this->fits($m, $s))) {
                    throw new HttpError(400, 'menu_recipe_hidden', ['title' => $s && $this->app->canView($user, $s) ? $s['title'] : '?']);
                }
                if (!$s) {
                    continue; // deleted meanwhile
                }
            } elseif ($text === '') {
                continue;
            }
            $sv = $it['servings'] ?? null;
            $out[] = ['week' => $week, 'day' => $day, 'meal' => $meal, 'recipe' => $rid, 'text' => $rid ? '' : $text,
                'servings' => is_numeric($sv) && $sv > 0 ? min(100.0, round((float) $sv, 2)) : null];
        }
        usort($out, fn($a, $b) => [$a['week'], $a['day'], array_search($a['meal'], self::MEALS, true)]
            <=> [$b['week'], $b['day'], array_search($b['meal'], self::MEALS, true)]);
        return $out;
    }
}
