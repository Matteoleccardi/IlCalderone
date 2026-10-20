<?php
declare(strict_types=1);

/**
 * Recipe storage and domain rules.
 *  data/recipes/<id>.json   one recipe: exchange format calderone-recipe/1 + owner/visibility/household/timestamps
 *  data/index/recipes.json  derived summaries for listing/search (rebuilt automatically if missing)
 *  data/media/<id>.<ext>    the dish photo
 *  data/media/<id>.icon.png an optional small pixel-art picture of the dish (128×128 PNG)
 *  data/media/<id>.model.vox an optional voxel model of the dish (MagicaVoxel .vox), shown in 3D on the recipe page
 *  data/history/<id>/<rev>.json  earlier versions (full copies), written every time the recipe is changed in place
 * Variants form a DAG: each child lists its parents ({id, kind, note}); children are found through the index.
 */
final class Recipes
{
    public const FORMAT = 'calderone-recipe/1';
    public const INDEX = 'index/recipes.json';
    /** Bumped when the summaries change shape: an index in another format is rebuilt. */
    private const INDEX_FORMAT = 'calderone-index/2';
    public const KINDS = ['variant', 'adaptation', 'inspired'];
    /** The fields compared and restored by the history (content + who can see it). */
    public const TRACKED = ['title', 'servings', 'time_minutes', 'facets', 'tags', 'ingredients', 'steps', 'notes', 'taken_from',
        'visibility', 'household'];
    private const PHOTO_TYPES = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    public const MIME = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    /** Icons are small PNGs (pixel art), at most this many bytes and pixels per side. */
    public const ICON_MAX_BYTES = 65536;
    public const ICON_MAX_SIDE = 512;
    /** Voxel models (MagicaVoxel .vox): at most this many bytes. */
    public const MODEL_MAX_BYTES = 262144;

    private ?array $index = null;

    public function __construct(private App $app)
    {
    }

    private function store(): Store
    {
        return $this->app->store;
    }

    // ---------- files and index ----------

    public function load(string $id): ?array
    {
        $r = Util::isId($id) ? $this->store()->read("recipes/{$id}.json") : null;
        return $r ? self::upgrade($r) : null;
    }

    /**
     * Files written before v0.3 called "taken_from" "source" and had no revision number. The old spreadsheet export
     * filled "source" with bookkeeping ("Ricette.xlsx · IMG_…"), which is not where a recipe comes from: dropped.
     */
    public static function upgrade(array $r): array
    {
        if (array_key_exists('source', $r) && !array_key_exists('taken_from', $r)) {
            $r['taken_from'] = str_starts_with((string) $r['source'], 'Ricette.xlsx') ? '' : $r['source'];
        }
        unset($r['source']);
        // before the fixed classification (facets) there was one free-text "category": it becomes the course,
        // or a tag when it isn't one
        if (!isset($r['facets'])) {
            $r['facets'] = Facets::clean([]);
            $cat = trim((string) ($r['category'] ?? ''));
            $course = $cat !== '' ? Facets::courseFromCategory($cat) : null;
            if ($course) {
                $r['facets']['course'] = $course;
            } elseif ($cat !== '' && !in_array(Util::lower($cat), $r['tags'] ?? [], true)) {
                $r['tags'][] = Util::lower($cat);
            }
        } else {
            $r['facets'] = Facets::clean($r['facets']);
        }
        unset($r['category']);
        $r['rev'] = (int) ($r['rev'] ?? 1);
        $r['updated_by'] = $r['updated_by'] ?? $r['owner'] ?? null;
        return $r;
    }

    /** Load a recipe the user can see, or 404 (also for invisible ones: don't leak existence). */
    public function visibleOr404(array $user, string $id): array
    {
        $r = $this->load($id);
        if (!$r || !$this->app->canView($user, $r)) {
            throw new HttpError(404, 'recipe_not_found');
        }
        return $r;
    }

    /** Owner, or a member of the recipe's household. */
    public function editableOr403(array $user, string $id): array
    {
        $r = $this->visibleOr404($user, $id);
        if (!$this->app->canEdit($user, $r)) {
            throw new HttpError(403, 'recipe_edit_denied');
        }
        return $r;
    }

    /** Deleting a recipe and changing its variant links stay with its creator. */
    public function ownedOr403(array $user, string $id): array
    {
        $r = $this->visibleOr404($user, $id);
        if (!$this->app->isOwner($user, $r)) {
            throw new HttpError(403, 'recipe_delete_denied');
        }
        return $r;
    }

    public static function summary(array $r): array
    {
        return [
            'id' => $r['id'], 'title' => $r['title'], 'servings' => $r['servings'], 'time_minutes' => $r['time_minutes'] ?? null,
            'facets' => $r['facets'] ?? Facets::blank(), 'tags' => $r['tags'] ?? [],
            'ingredients' => array_values(array_unique(array_map(fn($i) => $i['name'], $r['ingredients'] ?? []))),
            'units' => array_values(array_unique(array_filter(array_map(fn($i) => $i['unit'], $r['ingredients'] ?? [])))),
            'owner' => $r['owner'], 'visibility' => $r['visibility'], 'household' => $r['household'] ?? null,
            'parents' => array_map(fn($p) => $p['id'], $r['parents'] ?? []),
            'photo' => !empty($r['photo']), 'icon' => !empty($r['icon']), 'updated' => $r['updated'] ?? null,
        ];
    }

    public function index(): array
    {
        if ($this->index === null) {
            $idx = $this->store()->read(self::INDEX);
            $this->index = is_array($idx) && ($idx['format'] ?? '') === self::INDEX_FORMAT ? $idx['recipes'] : $this->rebuildIndex();
        }
        return $this->index;
    }

    public function rebuildIndex(): array
    {
        return $this->store()->locked(function () {
            $all = [];
            foreach ($this->store()->list('recipes') as $id) {
                $r = $this->load($id);
                if ($r) {
                    $all[$r['id']] = self::summary($r);
                }
            }
            $this->store()->write(self::INDEX, ['format' => self::INDEX_FORMAT, 'recipes' => $all]);
            $this->index = $all;
            return $all;
        });
    }

    public function save(array $r): array
    {
        $this->store()->locked(function () use ($r) {
            $this->store()->write("recipes/{$r['id']}.json", $r);
            $idx = $this->index();
            $idx[$r['id']] = self::summary($r);
            $this->writeIndex($idx);
        });
        return $r;
    }

    private function writeIndex(array $idx): void
    {
        uasort($idx, fn($a, $b) => strcmp(Util::lower($a['title']), Util::lower($b['title'])));
        $this->store()->write(self::INDEX, ['format' => self::INDEX_FORMAT, 'recipes' => $idx]);
        $this->index = $idx;
    }

    public function remove(array $r): void
    {
        $this->store()->locked(function () use ($r) {
            $id = $r['id'];
            // children keep living; only the edge to the deleted parent goes away
            foreach ($this->childIds($id) as $cid) {
                $c = $this->load($cid);
                if ($c) {
                    $c['parents'] = array_values(array_filter($c['parents'], fn($p) => $p['id'] !== $id));
                    $this->save($c);
                }
            }
            $this->deletePhoto($r);
            $this->deleteIcon($r);
            $this->deleteModel($r);
            $this->store()->delete("recipes/{$id}.json");
            $this->store()->deleteDir("history/{$id}");
            $idx = $this->index();
            unset($idx[$id]);
            $this->writeIndex($idx);
        });
        $this->app->emit('recipe.deleted', $r['id']);
    }

    // ---------- listing / search ----------

    /** Recipes the user can see, matching the search words and the facet filters (Facets::filtersFromQuery). */
    public function visible(array $user, string $q = '', bool $mine = false, array $filters = []): array
    {
        $terms = array_filter(preg_split('/\s+/u', Util::lower(trim($q))) ?: []);
        $names = $this->app->userNames();
        $out = [];
        foreach ($this->index() as $s) {
            if (!$this->app->canView($user, $s) || ($mine && $s['owner'] !== $user['id'])) {
                continue;
            }
            if ($filters && !Facets::matches($s['facets'] ?? [], $filters)) {
                continue;
            }
            $facetWords = str_replace('_', ' ', implode(' ', array_merge(...array_map(fn($v) => (array) $v, array_values($s['facets'] ?? [])))));
            $hay = Util::lower(implode(' | ', [$s['title'], implode(' ', $s['tags']), implode(' ', $s['ingredients']), $facetWords]));
            foreach ($terms as $t) {
                if (!str_contains($hay, $t)) {
                    continue 2;
                }
            }
            $out[] = $s + ['owner_name' => $names[$s['owner']] ?? '?'];
        }
        return $out;
    }

    // ---------- validation of user input ----------

    public static function parseQty(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            if ($v < 0 || !is_finite((float) $v)) {
                throw new HttpError(400, 'qty_invalid', ['value' => (string) $v]);
            }
            return (float) $v;
        }
        $s = Util::lower(trim(str_replace(',', '.', (string) $v)));
        if (in_array($s, ['', 'q.b.', 'qb', 'q.b'], true)) {
            return null;
        }
        $total = 0.0;
        foreach (preg_split('/\s+/', $s) as $part) { // "1 1/2"
            if (preg_match('#^(\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)$#', $part, $m) && (float) $m[2] != 0.0) {
                $total += (float) $m[1] / (float) $m[2];
            } elseif (is_numeric($part)) {
                $total += (float) $part;
            } else {
                throw new HttpError(400, 'qty_invalid', ['value' => (string) $v]);
            }
        }
        return $total;
    }

    /** Clean the content fields of a recipe coming from the client or from an imported file. */
    public static function cleanContent(array $d): array
    {
        $str = fn($v, int $max) => is_scalar($v) ? Util::clip(trim((string) $v), $max) : '';
        $title = Util::squash($str($d['title'] ?? '', 200));
        if ($title === '') {
            throw new HttpError(400, 'recipe_title_required');
        }
        $ingredients = [];
        foreach (is_array($d['ingredients'] ?? null) ? $d['ingredients'] : [] as $i) {
            if (!is_array($i)) {
                continue;
            }
            $name = Util::squash($str($i['name'] ?? '', 120));
            if ($name === '') {
                continue;
            }
            $qty = self::parseQty($i['qty'] ?? null);
            $unit = Util::squash($str($i['unit'] ?? '', 20));
            $ingredients[] = [
                'name' => $name, 'qty' => $qty, 'unit' => $unit !== '' ? $unit : ($qty === null ? 'q.b.' : ''),
                'optional' => !empty($i['optional']), 'note' => $str($i['note'] ?? '', 200),
            ];
        }
        $steps = [];
        foreach (is_array($d['steps'] ?? null) ? $d['steps'] : [] as $s) {
            if (!is_array($s)) {
                continue;
            }
            $step = ['title' => Util::squash($str($s['title'] ?? '', 200)), 'text' => $str($s['text'] ?? '', 5000)];
            if ($step['title'] !== '' || $step['text'] !== '') {
                $steps[] = $step;
            }
        }
        $tags = [];
        foreach (is_array($d['tags'] ?? null) ? $d['tags'] : explode(',', (string) ($d['tags'] ?? '')) as $t) {
            $t = Util::lower(Util::squash($str($t, 40)));
            if ($t !== '' && !in_array($t, $tags, true)) {
                $tags[] = $t;
            }
        }
        // the fixed classification; files from before it may still send a free-text "category"
        $facets = Facets::clean($d['facets'] ?? null);
        $cat = Util::squash($str($d['category'] ?? '', 60));
        if ($cat !== '' && $facets['course'] === null) {
            $course = Facets::courseFromCategory($cat);
            if ($course) {
                $facets['course'] = $course;
            } elseif (!in_array(Util::lower($cat), $tags, true)) {
                $tags[] = Util::lower($cat);
            }
        }
        $time = $d['time_minutes'] ?? null;
        $servings = (int) ($d['servings'] ?? 4);
        return [
            'title' => $title,
            'servings' => max(1, min(100, $servings ?: 4)),
            'time_minutes' => is_numeric($time) && (int) $time > 0 ? min(10000, (int) $time) : null,
            'facets' => $facets,
            'tags' => array_slice($tags, 0, 30),
            'ingredients' => array_slice($ingredients, 0, 200),
            'steps' => array_slice($steps, 0, 100),
            'notes' => $str($d['notes'] ?? '', 10000),
            // where the recipe comes from (book, site, grandma…); optional. The app shows "Source: <creator>, from <taken_from>".
            'taken_from' => $str($d['taken_from'] ?? $d['source'] ?? '', 500),
        ];
    }

    /** New recipes are visible to every user unless the creator picks otherwise. */
    public function create(array $user, array $input, ?string $id = null): array
    {
        [$vis, $hh] = $this->app->cleanScope($user, $input['visibility'] ?? 'shared', $input['household'] ?? null, 'shared');
        $now = Util::now();
        $r = ['format' => self::FORMAT, 'id' => $id ?? Util::id()] + self::cleanContent($input) + [
            'photo' => null, 'icon' => null, 'model' => null, 'parents' => [],
            'owner' => $user['id'], 'visibility' => $vis, 'household' => $hh, 'created' => $now, 'updated' => $now,
            'rev' => 1, 'updated_by' => $user['id'],
        ];
        return $this->save($r);
    }

    /**
     * Change a recipe in place. The previous version goes to data/history/<id>/<rev>.json first.
     * Only the owner may change who can see it; household members edit the content only.
     */
    public function update(array $user, array $r, array $input): array
    {
        if ($this->app->isOwner($user, $r)) {
            [$vis, $hh] = $this->app->cleanScope($user, $input['visibility'] ?? $r['visibility'], $input['household'] ?? $r['household']);
        } else {
            [$vis, $hh] = [$r['visibility'], $r['household']];
        }
        $new = array_replace($r, self::cleanContent($input), ['visibility' => $vis, 'household' => $hh]);
        unset($new['category']);
        if (!self::changes($r, $new)) {
            return $r;
        }
        return $this->store()->locked(function () use ($r, $new, $user) {
            $this->archive($r);
            $new['rev'] = $r['rev'] + 1;
            $new['updated'] = Util::now();
            $new['updated_by'] = $user['id'];
            return $this->save($new);
        });
    }

    // ---------- history (in-place edits; variants are separate recipes) ----------

    /** Names of the tracked fields that differ between two versions. */
    public static function changes(array $a, array $b): array
    {
        $out = [];
        foreach (self::TRACKED as $k) {
            if (($a[$k] ?? null) != ($b[$k] ?? null)) {
                $out[] = $k;
            }
        }
        return $out;
    }

    private function archive(array $r): void
    {
        $this->store()->write("history/{$r['id']}/{$r['rev']}.json", $r);
        $revs = $this->revisions($r['id']);
        $max = max(1, (int) ($this->app->config['history_max'] ?? 100));
        foreach (array_slice($revs, 0, max(0, count($revs) - $max)) as $old) {
            $this->store()->delete("history/{$r['id']}/{$old}.json");
        }
    }

    /** Revision numbers kept in the history, oldest first (the current version is not among them). */
    public function revisions(string $id): array
    {
        $revs = array_map('intval', $this->store()->list("history/{$id}"));
        sort($revs);
        return $revs;
    }

    public function revision(array $r, int $rev): array
    {
        if ($rev === $r['rev']) {
            return $r;
        }
        $old = $this->store()->read("history/{$r['id']}/{$rev}.json");
        if (!is_array($old)) {
            throw new HttpError(404, 'revision_not_found');
        }
        return self::upgrade($old);
    }

    /** Newest first: [{rev, updated, updated_by, by_name, changes[], current}]. "changes" = what that version changed. */
    public function history(array $r): array
    {
        $names = $this->app->userNames();
        $versions = [];
        foreach ($this->revisions($r['id']) as $rev) {
            $versions[] = $this->revision($r, $rev);
        }
        $versions[] = $r;
        $out = [];
        $last = count($versions) - 1;
        foreach ($versions as $i => $v) {
            $prev = $versions[$i - 1] ?? null;
            $out[] = [
                'rev' => $v['rev'], 'updated' => $v['updated'], 'updated_by' => $v['updated_by'],
                'by_name' => $names[$v['updated_by']] ?? null,
                'changes' => $prev ? self::changes($prev, $v) : [],
                'first' => $prev === null, 'current' => $i === $last,
            ];
        }
        return array_reverse($out);
    }

    /** Bring back the content of an old version (as a new version: nothing is lost). */
    public function restore(array $user, array $r, int $rev): array
    {
        $old = $this->revision($r, $rev);
        $content = array_intersect_key($old, array_flip(self::TRACKED));
        return $this->update($user, $r, $content);
    }

    // ---------- variant graph ----------

    public function childIds(string $id): array
    {
        $out = [];
        foreach ($this->index() as $s) {
            if (in_array($id, $s['parents'], true)) {
                $out[] = $s['id'];
            }
        }
        return $out;
    }

    public function descendantIds(string $id): array
    {
        $seen = [];
        $frontier = [$id];
        while ($frontier) {
            $next = [];
            foreach ($frontier as $f) {
                foreach ($this->childIds($f) as $c) {
                    if (!isset($seen[$c])) {
                        $seen[$c] = true;
                        $next[] = $c;
                    }
                }
            }
            $frontier = $next;
        }
        return array_keys($seen);
    }

    /** Add the edge parent → child to the child recipe (in memory); refuses cycles. */
    public function withParent(array $child, string $parentId, string $kind = 'variant', string $note = ''): array
    {
        if ($parentId === $child['id'] || in_array($parentId, $this->descendantIds($child['id']), true)) {
            throw new HttpError(409, 'variant_cycle');
        }
        $kind = in_array($kind, self::KINDS, true) ? $kind : 'variant';
        $child['parents'] = array_values(array_filter($child['parents'] ?? [], fn($p) => $p['id'] !== $parentId));
        $child['parents'][] = ['id' => $parentId, 'kind' => $kind, 'note' => Util::clip($note, 200)];
        return $child;
    }

    /** A copy that belongs to $user, linked to the original. It starts with the original's visibility. */
    public function createVariant(array $user, array $parent, string $suffix = ' (variante)'): array
    {
        return $this->store()->locked(function () use ($user, $parent, $suffix) {
            $content = array_intersect_key($parent, array_flip(['servings', 'time_minutes', 'facets', 'tags', 'ingredients', 'steps', 'notes', 'taken_from']));
            $child = $this->create($user, $content + ['title' => Util::clip($parent['title'] . $suffix, 200),
                'visibility' => $parent['visibility'], 'household' => $parent['household'] ?? null]);
            if (!empty($parent['photo'])) {
                $ext = pathinfo($parent['photo'], PATHINFO_EXTENSION);
                $src = $this->store()->path("media/{$parent['photo']}");
                if (is_file($src) && copy($src, $this->store()->path("media/{$child['id']}.{$ext}"))) {
                    $child['photo'] = "{$child['id']}.{$ext}";
                }
            }
            if (!empty($parent['icon']) && is_file($this->store()->path("media/{$parent['icon']}"))
                && copy($this->store()->path("media/{$parent['icon']}"), $this->store()->path("media/{$child['id']}.icon.png"))) {
                $child['icon'] = "{$child['id']}.icon.png";
            }
            if (!empty($parent['model']) && is_file($this->store()->path("media/{$parent['model']}"))
                && copy($this->store()->path("media/{$parent['model']}"), $this->store()->path("media/{$child['id']}.model.vox"))) {
                $child['model'] = "{$child['id']}.model.vox";
            }
            return $this->save($this->withParent($child, $parent['id'], 'variant'));
        });
    }

    /** Parents/children the user may see, as {id, title, kind}. */
    public function relatives(array $user, array $r): array
    {
        $idx = $this->index();
        $parents = [];
        foreach ($r['parents'] ?? [] as $p) {
            if (isset($idx[$p['id']]) && $this->app->canView($user, $idx[$p['id']])) {
                $parents[] = ['id' => $p['id'], 'title' => $idx[$p['id']]['title'], 'kind' => $p['kind'], 'note' => $p['note'] ?? ''];
            }
        }
        $children = [];
        foreach ($this->childIds($r['id']) as $cid) {
            if ($this->app->canView($user, $idx[$cid])) {
                $c = $this->load($cid);
                $kind = 'variant';
                foreach ($c['parents'] ?? [] as $p) {
                    if ($p['id'] === $r['id']) {
                        $kind = $p['kind'];
                    }
                }
                $children[] = ['id' => $cid, 'title' => $idx[$cid]['title'], 'kind' => $kind];
            }
        }
        return [$parents, $children];
    }

    // ---------- photos ----------

    public function savePhoto(array $r, array $file, int $max): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new HttpError(400, 'photo_upload_failed');
        }
        if ($file['size'] > $max) {
            throw new HttpError(413, 'photo_too_large');
        }
        $info = @getimagesize($file['tmp_name']);
        $ext = $info ? (self::PHOTO_TYPES[$info[2]] ?? null) : null;
        if (!$ext) {
            throw new HttpError(415, 'photo_type');
        }
        $this->deletePhoto($r);
        $name = "{$r['id']}.{$ext}";
        $dest = $this->store()->path("media/{$name}");
        if (!is_dir(dirname($dest))) {
            mkdir(dirname($dest), 0775, true);
        }
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new HttpError(500, 'photo_save_failed');
        }
        $r['photo'] = $name;
        $r['updated'] = Util::now();
        return $this->save($r);
    }

    /** Photo embedded in an exchange file as a data: URI (see toExchange with $photos = true). */
    public function savePhotoData(array $r, string $uri): array
    {
        if (!preg_match('#^data:image/[a-z]+;base64,(.+)$#s', $uri, $m)) {
            return $r;
        }
        $bin = base64_decode($m[1], true);
        $max = (int) ($this->app->config['max_upload'] ?? 8388608);
        $info = $bin !== false && strlen($bin) <= $max ? @getimagesizefromstring($bin) : false;
        $ext = $info ? (self::PHOTO_TYPES[$info[2]] ?? null) : null;
        if (!$ext) {
            return $r;
        }
        $this->deletePhoto($r);
        $this->store()->locked(function () use ($r, $ext, $bin) {
            $dest = $this->store()->path("media/{$r['id']}.{$ext}");
            if (!is_dir(dirname($dest))) {
                mkdir(dirname($dest), 0775, true);
            }
            file_put_contents($dest, $bin);
        });
        $r['photo'] = "{$r['id']}.{$ext}";
        return $this->save($r);
    }

    public function deletePhoto(array $r): array
    {
        if (!empty($r['photo'])) {
            $this->store()->delete("media/" . basename($r['photo']));
        }
        $r['photo'] = null;
        return $r;
    }

    // ---------- voxel models ----------

    /** Save a voxel model from raw .vox bytes (an upload or an exchange file's model_data). */
    public function saveModelBytes(array $r, string $bin): array
    {
        if (strlen($bin) > self::MODEL_MAX_BYTES) {
            throw new HttpError(413, 'model_too_large');
        }
        if (strlen($bin) < 20 || substr($bin, 0, 4) !== 'VOX ' || strpos($bin, 'MAIN') !== 8) {
            throw new HttpError(415, 'model_type');
        }
        $name = "{$r['id']}.model.vox";
        $this->store()->locked(function () use ($name, $bin) {
            $dest = $this->store()->path("media/{$name}");
            if (!is_dir(dirname($dest))) {
                mkdir(dirname($dest), 0775, true);
            }
            file_put_contents($dest, $bin);
        });
        $r['model'] = $name;
        $r['updated'] = Util::now();
        return $this->save($r);
    }

    public function saveModel(array $r, array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new HttpError(400, 'photo_upload_failed');
        }
        return $this->saveModelBytes($r, (string) file_get_contents($file['tmp_name']));
    }

    public function deleteModel(array $r): array
    {
        if (!empty($r['model'])) {
            $this->store()->delete('media/' . basename($r['model']));
        }
        $r['model'] = null;
        return $r;
    }

    // ---------- icons ----------

    /** Save an icon from raw PNG bytes (an upload or an exchange file's icon_data). */
    public function saveIconBytes(array $r, string $bin): array
    {
        $info = strlen($bin) <= self::ICON_MAX_BYTES ? @getimagesizefromstring($bin) : false;
        if (strlen($bin) > self::ICON_MAX_BYTES) {
            throw new HttpError(413, 'icon_too_large');
        }
        if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > self::ICON_MAX_SIDE || $info[1] > self::ICON_MAX_SIDE) {
            throw new HttpError(415, 'icon_type');
        }
        $name = "{$r['id']}.icon.png";
        $this->store()->locked(function () use ($name, $bin) {
            $dest = $this->store()->path("media/{$name}");
            if (!is_dir(dirname($dest))) {
                mkdir(dirname($dest), 0775, true);
            }
            file_put_contents($dest, $bin);
        });
        $r['icon'] = $name;
        $r['updated'] = Util::now();
        return $this->save($r);
    }

    public function saveIcon(array $r, array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw new HttpError(400, 'photo_upload_failed');
        }
        return $this->saveIconBytes($r, (string) file_get_contents($file['tmp_name']));
    }

    public function deleteIcon(array $r): array
    {
        if (!empty($r['icon'])) {
            $this->store()->delete('media/' . basename($r['icon']));
        }
        $r['icon'] = null;
        return $r;
    }

    // ---------- exchange format ----------

    /** Exchange-format copy of a recipe; with $photos the dish photo is embedded as photo_data (data: URI). */
    public function toExchange(array $r, bool $photos = false): array
    {
        $keys = ['format', 'id', 'title', 'servings', 'time_minutes', 'facets', 'tags', 'ingredients', 'steps', 'notes', 'taken_from', 'photo', 'icon', 'model', 'parents'];
        $out = [];
        foreach ($keys as $k) {
            $out[$k] = $r[$k] ?? null;
        }
        $out['format'] = self::FORMAT;
        if ($photos && !empty($r['photo']) && $this->store()->exists('media/' . basename($r['photo']))) {
            $ext = pathinfo($r['photo'], PATHINFO_EXTENSION);
            $out['photo_data'] = 'data:' . (self::MIME[$ext] ?? 'image/jpeg') . ';base64,'
                . base64_encode((string) file_get_contents($this->store()->path('media/' . basename($r['photo']))));
        }
        if ($photos && !empty($r['icon']) && $this->store()->exists('media/' . basename($r['icon']))) {
            $out['icon_data'] = 'data:image/png;base64,'
                . base64_encode((string) file_get_contents($this->store()->path('media/' . basename($r['icon']))));
        }
        if ($photos && !empty($r['model']) && $this->store()->exists('media/' . basename($r['model']))) {
            $out['model_data'] = 'data:application/octet-stream;base64,'
                . base64_encode((string) file_get_contents($this->store()->path('media/' . basename($r['model']))));
        }
        return $out;
    }

    /** Import exchange-format recipes. Existing ids are skipped (idempotent); parents are linked when present. */
    public function import(array $user, array $items, string $visibility, ?string $household): array
    {
        return $this->store()->locked(function () use ($user, $items, $visibility, $household) {
            $created = [];
            $msgs = [];
            $pending = [];
            foreach ($items as $d) {
                if (!is_array($d)) {
                    $msgs[] = ['code' => 'import_invalid_item', 'params' => []];
                    continue;
                }
                $title = is_string($d['title'] ?? null) ? $d['title'] : '?';
                if (($d['format'] ?? self::FORMAT) !== self::FORMAT) {
                    $msgs[] = ['code' => 'import_format', 'params' => ['title' => $title]];
                    continue;
                }
                $id = isset($d['id']) && is_string($d['id']) && Util::isId($d['id']) ? $d['id'] : null;
                if ($id && $this->load($id)) {
                    $msgs[] = ['code' => 'import_exists', 'params' => ['title' => $title]];
                    continue;
                }
                try {
                    $r = $this->create($user, ['visibility' => $visibility, 'household' => $household] + $d, $id);
                } catch (HttpError $e) {
                    $msgs[] = ['code' => 'import_failed', 'params' => ['title' => $title, 'reason' => $e->errorCode] + $e->params];
                    continue;
                }
                if (is_string($d['photo_data'] ?? null)) {
                    $r = $this->savePhotoData($r, $d['photo_data']);
                }
                if (is_string($d['icon_data'] ?? null) && preg_match('#^data:image/png;base64,(.+)$#s', $d['icon_data'], $im)) {
                    try {
                        $r = $this->saveIconBytes($r, (string) base64_decode($im[1], true));
                    } catch (HttpError $e) {
                        $msgs[] = ['code' => 'import_failed', 'params' => ['title' => $title, 'reason' => $e->errorCode]];
                    }
                }
                if (is_string($d['model_data'] ?? null) && preg_match('#^data:[a-z0-9./+-]*;base64,(.+)$#s', $d['model_data'], $mm)) {
                    try {
                        $r = $this->saveModelBytes($r, (string) base64_decode($mm[1], true));
                    } catch (HttpError $e) {
                        $msgs[] = ['code' => 'import_failed', 'params' => ['title' => $title, 'reason' => $e->errorCode]];
                    }
                }
                if (Facets::missing($r['facets'])) {
                    $msgs[] = ['code' => 'import_facets_missing', 'params' => ['title' => $r['title']]];
                }
                $created[] = $r['id'];
                $pending[$r['id']] = is_array($d['parents'] ?? null) ? $d['parents'] : [];
            }
            foreach ($pending as $rid => $parents) {
                foreach ($parents as $p) {
                    if (is_array($p) && is_string($p['id'] ?? null) && $this->load($p['id'])) {
                        try {
                            $this->save($this->withParent($this->load($rid), $p['id'], (string) ($p['kind'] ?? 'variant'), (string) ($p['note'] ?? '')));
                        } catch (HttpError $e) {
                            $msgs[] = ['code' => $e->errorCode, 'params' => $e->params];
                        }
                    }
                }
            }
            return ['created' => $created, 'messages' => $msgs];
        });
    }
}
