<?php
declare(strict_types=1);

// Named collections of recipes ("Cena di Natale"), with the same private/household/shared scopes as recipes.
// Household collections can be changed (and deleted) by every member of the household.
// data/collections/<id>.json = {format, id, name, description, owner, visibility, household, items[{recipe, note, added}]}
return [
    'name' => 'collections',
    'label' => 'Raccolte',
    'requires' => ['recipes'],
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        /** @var Recipes $recipes */
        $recipes = $app->services['recipes'];

        $all = function () use ($store) {
            $out = [];
            foreach ($store->list('collections') as $id) {
                if ($c = $store->read("collections/{$id}.json")) {
                    $out[] = $c;
                }
            }
            usort($out, fn($a, $b) => strcmp(Util::lower($a['name']), Util::lower($b['name'])));
            return $out;
        };
        $load = function (array $u, string $id, bool $edit = false) use ($store, $app) {
            $c = Util::isId($id) ? $store->read("collections/{$id}.json") : null;
            if (!$c || !$app->canView($u, $c)) {
                throw new HttpError(404, 'collection_not_found');
            }
            if ($edit && !$app->canEdit($u, $c)) {
                throw new HttpError(403, 'collection_edit_denied');
            }
            return $c;
        };
        $save = function (array $c) use ($store) {
            $store->write("collections/{$c['id']}.json", $c);
            return $c;
        };
        $view = function (array $u, array $c) use ($app, $recipes) {
            $idx = $recipes->index();
            $c['items'] = array_map(function ($it) use ($idx, $u, $app) {
                $s = $idx[$it['recipe']] ?? null;
                $ok = $s && $app->canView($u, $s);
                return $it + ['title' => $ok ? $s['title'] : null, 'photo' => $ok && $s['photo'], 'available' => $ok];
            }, $c['items']);
            return $c + ['can_edit' => $app->canEdit($u, $c), 'owner_name' => $app->userNames()[$c['owner']] ?? '?'];
        };
        $fields = function (array $u, Request $r, array $c) use ($app) {
            [$vis, $hh] = $app->cleanScope($u, $r->json()['visibility'] ?? $c['visibility'] ?? 'private', $r->json()['household'] ?? $c['household'] ?? null);
            $name = Util::squash($r->str('name', 120, $c['name'] ?? ''));
            if ($name === '') {
                throw new HttpError(400, 'collection_name_required');
            }
            return array_replace($c, ['name' => $name, 'description' => $r->str('description', 2000, $c['description'] ?? ''),
                'visibility' => $vis, 'household' => $hh, 'updated' => Util::now()]);
        };

        $app->get('/collections', function (Request $r) use ($auth, $app, $all) {
            $u = $auth->require();
            $names = $app->userNames();
            $out = [];
            foreach ($all() as $c) {
                if ($app->canView($u, $c)) {
                    $out[] = ['id' => $c['id'], 'name' => $c['name'], 'description' => $c['description'], 'count' => count($c['items']),
                        'visibility' => $c['visibility'], 'can_edit' => $app->canEdit($u, $c), 'owner_name' => $names[$c['owner']] ?? '?',
                        'contains' => in_array($r->q('recipe'), array_column($c['items'], 'recipe'), true)];
                }
            }
            return $out;
        });

        $app->post('/collections', function (Request $r) use ($auth, $fields, $save, $view) {
            $u = $auth->require();
            $c = $fields($u, $r, ['format' => 'calderone-collection/1', 'id' => Util::id(), 'owner' => $u['id'], 'items' => [], 'created' => Util::now()]);
            return $view($u, $save($c));
        });

        $app->get('/collections/{id}', fn(Request $r, array $p) => $view($u = $auth->require(), $load($u, $p['id'])));

        $app->put('/collections/{id}', function (Request $r, array $p) use ($auth, $load, $fields, $save, $view, $store) {
            $u = $auth->require();
            return $store->locked(fn() => $view($u, $save($fields($u, $r, $load($u, $p['id'], true)))));
        });

        $app->delete('/collections/{id}', function (Request $r, array $p) use ($auth, $load, $store) {
            $c = $load($u = $auth->require(), $p['id'], true);
            $store->delete("collections/{$c['id']}.json");
            return ['ok' => true];
        });

        $app->post('/collections/{id}/items', function (Request $r, array $p) use ($auth, $load, $save, $view, $store, $recipes) {
            $u = $auth->require();
            return $store->locked(function () use ($u, $r, $p, $load, $save, $view, $recipes) {
                $c = $load($u, $p['id'], true);
                $rec = $recipes->visibleOr404($u, $r->str('recipe', 64));
                if (!in_array($rec['id'], array_column($c['items'], 'recipe'), true)) {
                    $c['items'][] = ['recipe' => $rec['id'], 'note' => $r->str('note', 200), 'added' => Util::now()];
                }
                return $view($u, $save($c));
            });
        });

        $app->delete('/collections/{id}/items/{rid}', function (Request $r, array $p) use ($auth, $load, $save, $view, $store) {
            $u = $auth->require();
            return $store->locked(function () use ($u, $p, $load, $save, $view) {
                $c = $load($u, $p['id'], true);
                $c['items'] = array_values(array_filter($c['items'], fn($it) => $it['recipe'] !== $p['rid']));
                return $view($u, $save($c));
            });
        });

        $app->on('recipe.deleted', function (string $rid) use ($all, $save, $store) {
            $store->locked(function () use ($rid, $all, $save) {
                foreach ($all() as $c) {
                    if (in_array($rid, array_column($c['items'], 'recipe'), true)) {
                        $c['items'] = array_values(array_filter($c['items'], fn($it) => $it['recipe'] !== $rid));
                        $save($c);
                    }
                }
            });
        });
        $app->on('user.deleted', function (string $uid) use ($all, $store) {
            foreach ($all() as $c) {
                if ($c['owner'] === $uid && $c['visibility'] === 'private') {
                    $store->delete("collections/{$c['id']}.json");
                }
            }
        });
    },
];
