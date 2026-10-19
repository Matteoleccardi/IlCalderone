<?php
declare(strict_types=1);

require_once __DIR__ . '/Menus.php';

// Menus (N-week cycles) and the plan "what's for dinner?" over all the menus you can see. See Menus.php.
return [
    'name' => 'menus',
    'label' => 'Menu',
    'requires' => ['recipes'],
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        /** @var Recipes $recipes */
        $recipes = $app->services['recipes'];
        $svc = new Menus($app, $recipes);
        $app->services['menus'] = $svc;

        $householdName = function (?string $id) use ($app) {
            return $id ? ($app->household($id)['name'] ?? null) : null;
        };
        $summary = function (array $u, array $m) use ($app, $householdName) {
            $today = date('Y-m-d');
            [$w, $d] = Menus::slot($m, $today);
            return [
                'id' => $m['id'], 'name' => $m['name'], 'notes' => $m['notes'], 'visibility' => $m['visibility'],
                'household' => $m['household'], 'household_name' => $householdName($m['household']),
                'start' => $m['start'], 'weeks' => $m['weeks'], 'meals' => $m['meals'], 'season' => $m['season'], 'active' => $m['active'],
                'in_season' => Menus::inSeason($m, $today), 'today' => ['week' => $w, 'day' => $d], 'count' => count($m['items']),
                'can_edit' => $app->canEdit($u, $m), 'is_owner' => $app->isOwner($u, $m),
                'owner_name' => $app->userNames()[$m['owner']] ?? null,
            ];
        };
        $view = function (array $u, array $m) use ($summary, $recipes, $app) {
            $idx = $recipes->index();
            $items = array_map(function ($it) use ($idx, $u, $app) {
                $s = $it['recipe'] ? ($idx[$it['recipe']] ?? null) : null;
                $ok = $s && $app->canView($u, $s);
                return $it + ['title' => $ok ? $s['title'] : null, 'available' => $ok, 'recipe_servings' => $ok ? $s['servings'] : null];
            }, $m['items']);
            return $summary($u, $m) + ['items' => $items];
        };

        $app->get('/menus', function () use ($auth, $svc, $summary) {
            $u = $auth->require();
            return array_map(fn($m) => $summary($u, $m), $svc->visible($u));
        });

        // ?from=YYYY-MM-DD (default today) &days=7 (max 42)
        $app->get('/menus/plan', function (Request $r) use ($auth, $svc) {
            $u = $auth->require();
            $from = Util::isDate($r->q('from')) ? $r->q('from') : date('Y-m-d');
            return ['from' => $from, 'days' => $svc->plan($u, $from, max(1, min(42, (int) ($r->q('days') ?: 7))))];
        });

        $app->post('/menus', function (Request $r) use ($auth, $svc, $view, $store) {
            $u = $auth->require();
            return $store->locked(function () use ($u, $r, $svc, $view) {
                $now = Util::now();
                $m = $svc->clean($u, $r->json(), ['format' => Menus::FORMAT, 'id' => Util::id(), 'owner' => $u['id'], 'items' => []]);
                $m = ['format' => Menus::FORMAT] + $m + ['owner' => $u['id'], 'created' => $now, 'updated' => $now, 'updated_by' => $u['id']];
                return $view($u, $svc->save($m));
            });
        });

        $app->get('/menus/{id}', function (Request $r, array $p) use ($auth, $svc, $view) {
            $u = $auth->require();
            return $view($u, $svc->load($u, $p['id']));
        });

        // Replace the fields that are sent (items = the whole list of the menu's dishes).
        $app->put('/menus/{id}', function (Request $r, array $p) use ($auth, $svc, $view, $store) {
            $u = $auth->require();
            return $store->locked(function () use ($u, $r, $p, $svc, $view) {
                $m = $svc->clean($u, $r->json(), $svc->load($u, $p['id'], true));
                $m['updated'] = Util::now();
                $m['updated_by'] = $u['id'];
                return $view($u, $svc->save($m));
            });
        });

        // Add one dish to a slot: {week, day, meal, recipe | text, servings?} (the "Add to menu" button).
        $app->post('/menus/{id}/items', function (Request $r, array $p) use ($auth, $svc, $view, $store) {
            $u = $auth->require();
            return $store->locked(function () use ($u, $r, $p, $svc, $view) {
                $m = $svc->load($u, $p['id'], true);
                $d = $r->json();
                $week = (int) ($d['week'] ?? 0);
                $day = (int) ($d['day'] ?? 0);
                $meal = (string) ($d['meal'] ?? '');
                if ($week < 1 || $week > $m['weeks'] || $day < 1 || $day > 7 || !in_array($meal, $m['meals'], true)) {
                    throw new HttpError(400, 'menu_slot_invalid');
                }
                $before = count($m['items']);
                $item = ['week' => $week, 'day' => $day, 'meal' => $meal, 'recipe' => $d['recipe'] ?? null,
                    'text' => $d['text'] ?? '', 'servings' => $d['servings'] ?? null];
                $m = $svc->clean($u, ['items' => [...$m['items'], $item]], $m);
                if (count($m['items']) === $before) {
                    throw new HttpError(400, 'menu_dish_required');
                }
                $m['updated'] = Util::now();
                $m['updated_by'] = $u['id'];
                return $view($u, $svc->save($m));
            });
        });

        $app->delete('/menus/{id}', function (Request $r, array $p) use ($auth, $svc) {
            $u = $auth->require();
            $svc->delete($svc->load($u, $p['id'], true));
            return ['ok' => true];
        });

        $app->on('recipe.deleted', function (string $rid) use ($svc, $store) {
            $store->locked(function () use ($rid, $svc) {
                foreach ($svc->all() as $m) {
                    if (in_array($rid, array_column($m['items'], 'recipe'), true)) {
                        $m['items'] = array_values(array_filter($m['items'], fn($it) => $it['recipe'] !== $rid));
                        $svc->save($m);
                    }
                }
            });
        });
        $app->on('household.deleted', function (string $hid) use ($svc) {
            foreach ($svc->all() as $m) {
                if ($m['visibility'] === 'household' && $m['household'] === $hid) {
                    $svc->delete($m);
                }
            }
        });
        $app->on('user.deleted', function (string $uid) use ($svc) {
            foreach ($svc->all() as $m) {
                if ($m['visibility'] === 'private' && $m['owner'] === $uid) {
                    $svc->delete($m);
                }
            }
        });
    },
];
