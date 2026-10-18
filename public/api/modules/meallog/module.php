<?php
declare(strict_types=1);

// "Cosa ho mangiato?": a meal diary. Everyone writes only their own diary; the members of your households can read it.
// data/meallog/<userId>/<YYYY-MM>.json = {format, entries[{id, day, meal, recipe, title, servings, note, created}]}
// An entry points to a recipe (title kept as a snapshot, so it survives the recipe's deletion) or is free text.
return [
    'name' => 'meallog',
    'label' => 'Diario',
    'requires' => ['recipes'],
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        /** @var Recipes $recipes */
        $recipes = $app->services['recipes'];
        $MEALS = ['colazione', 'pranzo', 'cena', 'spuntino'];
        $default = ['format' => 'calderone-meallog/1', 'entries' => []];

        /** Entries of a user from $since (Y-m-d) on, newest first. */
        $entries = function (string $uid, string $since = '0000-00-00') use ($store) {
            $out = [];
            foreach ($store->list("meallog/{$uid}") as $month) {
                if ($month . '-31' < $since) {
                    continue;
                }
                foreach ($store->read("meallog/{$uid}/{$month}.json")['entries'] ?? [] as $e) {
                    if ($e['day'] >= $since) {
                        $out[] = $e + ['user' => $uid];
                    }
                }
            }
            return $out;
        };
        $newestFirst = function (array $list): array {
            usort($list, fn($a, $b) => [$b['day'], $b['created']] <=> [$a['day'], $a['created']]);
            return $list;
        };
        $app->services['meallog'] = ['entries' => $entries];

        // ?days=30 &user=<id>|all  (default: me). "all" = me and everyone in my households.
        $app->get('/meallog', function (Request $r) use ($auth, $entries, $newestFirst, $recipes, $app, $MEALS) {
            $u = $auth->require();
            $peers = $app->peerIds($u);
            $who = $r->q('user', $u['id']);
            if ($who === 'all') {
                $users = $peers;
            } elseif (in_array($who, $peers, true)) {
                $users = [$who];
            } else {
                throw new HttpError(403, 'diary_hidden');
            }
            $days = max(1, min(3660, (int) ($r->q('days') ?: 30)));
            $since = date('Y-m-d', time() - 86400 * ($days - 1));
            $since90 = date('Y-m-d', time() - 86400 * 89);
            $idx = $recipes->index();
            $names = $app->userNames();
            $list = [];
            $recent = [];
            foreach ($users as $uid) {
                foreach ($entries($uid, min($since, $since90)) as $e) {
                    if ($e['day'] >= $since90) {
                        $recent[] = $e;
                    }
                    if ($e['day'] >= $since) {
                        $s = $e['recipe'] ? ($idx[$e['recipe']] ?? null) : null;
                        $list[] = $e + ['user_name' => $names[$uid] ?? null, 'mine' => $uid === $u['id'],
                            'recipe_available' => $s !== null && $app->canView($u, $s)];
                    }
                }
            }
            // most eaten recipes of the last 90 days (of the people shown)
            $counts = [];
            foreach ($recent as $e) {
                if ($e['recipe']) {
                    $counts[$e['recipe']] = ($counts[$e['recipe']] ?? ['recipe' => $e['recipe'], 'title' => $e['title'], 'count' => 0]);
                    $counts[$e['recipe']]['count']++;
                }
            }
            usort($counts, fn($a, $b) => $b['count'] <=> $a['count']);
            $people = array_map(fn($id) => ['id' => $id, 'name' => $names[$id] ?? null], $peers);
            return ['entries' => $newestFirst($list), 'top' => array_slice(array_values($counts), 0, 5), 'meals' => $MEALS, 'people' => $people];
        });

        // Panel data for a recipe page: how many times I ate it and when last.
        $app->get('/meallog/recipe/{rid}', function (Request $r, array $p) use ($auth, $entries, $newestFirst) {
            $u = $auth->require();
            $mine = $newestFirst(array_values(array_filter($entries($u['id']), fn($e) => $e['recipe'] === $p['rid'])));
            return ['count' => count($mine), 'last' => $mine[0]['day'] ?? null];
        });

        $app->post('/meallog', function (Request $r) use ($auth, $store, $recipes, $MEALS, $default) {
            $u = $auth->require();
            $day = $r->str('day', 10) ?: date('Y-m-d');
            if (!Util::isDate($day)) {
                throw new HttpError(400, 'date_invalid');
            }
            $meal = in_array($r->str('meal', 20), $MEALS, true) ? $r->str('meal', 20) : 'cena';
            $rid = $r->str('recipe', 64);
            $title = Util::squash($r->str('text', 200));
            if ($rid !== '') {
                $title = $recipes->visibleOr404($u, $rid)['title'];
            } elseif ($title === '') {
                throw new HttpError(400, 'meallog_empty');
            }
            $servings = $r->json()['servings'] ?? null;
            $month = substr($day, 0, 7);
            $e = [
                'id' => $month . '-' . bin2hex(random_bytes(6)), 'day' => $day, 'meal' => $meal,
                'recipe' => $rid !== '' ? $rid : null, 'title' => $title,
                'servings' => is_numeric($servings) && $servings > 0 ? min(100, (float) $servings) : null,
                'note' => $r->str('note', 500), 'created' => Util::now(),
            ];
            $store->update("meallog/{$u['id']}/{$month}.json", function ($d) use ($e) {
                $d['entries'][] = $e;
                return $d;
            }, $default);
            return $e;
        });

        // Only your own entries can be deleted (the path is always your own diary).
        $app->delete('/meallog/{eid}', function (Request $r, array $p) use ($auth, $store, $default) {
            $u = $auth->require();
            if (!preg_match('/^(\d{4}-\d{2})-[a-f0-9]+$/', $p['eid'], $m)) {
                throw new HttpError(404, 'entry_not_found');
            }
            $store->update("meallog/{$u['id']}/{$m[1]}.json", function ($d) use ($p) {
                $d['entries'] = array_values(array_filter($d['entries'], fn($e) => $e['id'] !== $p['eid']));
                return $d;
            }, $default);
            return ['ok' => true];
        });

        $app->on('user.deleted', fn(string $uid) => $store->deleteDir("meallog/{$uid}"));
    },
];
