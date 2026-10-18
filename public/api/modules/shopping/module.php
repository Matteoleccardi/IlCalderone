<?php
declare(strict_types=1);

/**
 * Shopping lists and pantries, one per space (your personal space, or a household: see App::space).
 *
 * The list of a week (Monday–Sunday) is computed live from the menus of that space: the ingredients of every dish,
 * scaled to its servings, summed per ingredient+unit ("q.b." kept apart), minus the pantry. On top of it we store:
 *  data/shopping/<spaceKey>/<monday>.json = {format: calderone-shopping/1, week, checked[keys], extra[{id,name,qty,unit,note,by,added}],
 *                                            moved {key: householdId}}   (moved: personal lists only)
 *  data/pantry/<spaceKey>.json             = {format: calderone-pantry/1, items[{name, added, by}]}   always at home: never listed
 * Items of a personal list can be moved to one of your households' lists ("Inserisci nella lista di casa"); they stay
 * live (they follow your private menus) but show up, and are ticked, in the household list.
 */
return [
    'name' => 'shopping',
    'label' => 'Spesa',
    'requires' => ['recipes', 'menus'],
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        /** @var Recipes $recipes */
        $recipes = $app->services['recipes'];
        /** @var Menus $menus */
        $menus = $app->services['menus'];
        $QB = 'q.b.';

        $keyOf = fn(string $name, string $unit) => Util::lower(Util::squash($name)) . '|' . Util::lower(trim($unit));

        /** Monday of the requested week; default: this week, or next week on Saturday and Sunday (as in the spreadsheet). */
        $weekOf = function (string $w): string {
            if (Util::isDate($w)) {
                return Util::monday($w);
            }
            $today = date('Y-m-d');
            return Util::weekday($today) >= 6 ? Util::addDays(Util::monday($today), 7) : Util::monday($today);
        };

        $stateFile = fn(array $space, string $week) => "shopping/{$space['key']}/{$week}.json";
        $state = function (array $space, string $week) use ($store, $stateFile) {
            return $store->read($stateFile($space, $week), null) ?? ['format' => 'calderone-shopping/1', 'week' => $week,
                'checked' => [], 'extra' => [], 'moved' => (object) []];
        };
        $saveState = function (array $space, string $week, callable $fn) use ($store, $stateFile, $state) {
            return $store->locked(function () use ($space, $week, $fn, $store, $stateFile, $state) {
                $d = $fn($state($space, $week));
                $d['moved'] = (object) (array) $d['moved'];
                $store->write($stateFile($space, $week), $d);
                return $d;
            });
        };
        $pantry = fn(array $space) => $store->read("pantry/{$space['key']}.json", ['format' => 'calderone-pantry/1', 'items' => []]);
        $pantrySet = function (array $space) use ($pantry) {
            $set = [];
            foreach ($pantry($space)['items'] as $p) {
                $set[Util::lower(Util::squash($p['name']))] = true;
            }
            return $set;
        };

        /** Ingredients needed by the menus of a space in a week, minus its pantry: key => item. */
        $needed = function (array $user, array $space, string $week) use ($menus, $recipes, $keyOf, $pantrySet, $QB) {
            $cache = [];
            $items = [];
            foreach ($menus->ofSpace($user, $space) as $m) {
                for ($i = 0; $i < 7; $i++) {
                    $day = Util::addDays($week, $i);
                    foreach (Menus::itemsOn($m, $day) as $it) {
                        if (!$it['recipe']) {
                            continue;
                        }
                        $r = $cache[$it['recipe']] ??= $recipes->load($it['recipe']);
                        if (!$r || !$menus->fits($m, $r)) {
                            continue;
                        }
                        $servings = $it['servings'] ?? $r['servings'];
                        foreach ($r['ingredients'] as $ing) {
                            $qb = $ing['qty'] === null || Util::lower($ing['unit']) === $QB;
                            $unit = $qb ? $QB : $ing['unit'];
                            $k = $keyOf($ing['name'], $unit);
                            $items[$k] ??= ['key' => $k, 'name' => $ing['name'], 'unit' => $unit, 'qty' => $qb ? null : 0.0,
                                'optional' => true, 'sources' => [], 'from' => []];
                            if (!$qb) {
                                $items[$k]['qty'] += $ing['qty'] * $servings / max(1, $r['servings']);
                            }
                            $items[$k]['optional'] = $items[$k]['optional'] && !empty($ing['optional']);
                            $items[$k]['sources'][] = ['recipe' => $r['id'], 'title' => $r['title'], 'day' => $day, 'meal' => $it['meal'], 'menu' => $m['name']];
                        }
                    }
                }
            }
            $skip = $pantrySet($space);
            return array_filter($items, fn($it) => !isset($skip[Util::lower(Util::squash($it['name']))]));
        };

        $merge = function (array &$into, array $item, ?string $from) {
            $k = $item['key'];
            if (!isset($into[$k])) {
                $into[$k] = $item;
            } else {
                if ($item['qty'] !== null) {
                    $into[$k]['qty'] = ($into[$k]['qty'] ?? 0) + $item['qty'];
                }
                $into[$k]['optional'] = $into[$k]['optional'] && $item['optional'];
                $into[$k]['sources'] = array_merge($into[$k]['sources'], $item['sources']);
            }
            if ($from !== null && !in_array($from, $into[$k]['from'], true)) {
                $into[$k]['from'][] = $from;
            }
        };

        $view = function (array $user, array $space, string $week) use ($app, $auth, $needed, $state, $pantry, $pantrySet, $merge, $keyOf, $recipes) {
            $st = $state($space, $week);
            $movedTo = (array) $st['moved'];
            $names = $app->userNames();
            $items = $needed($user, $space, $week);
            $moved = [];
            if ($space['household'] === null) {
                foreach ($items as $k => $it) {
                    if (isset($movedTo[$k])) {
                        $moved[] = $it + ['household' => $movedTo[$k], 'household_name' => $app->household($movedTo[$k])['name'] ?? null];
                        unset($items[$k]);
                    }
                }
            } else {
                // items that members moved here from their personal lists
                $skip = $pantrySet($space);
                foreach ($app->memberIds($space['household']) as $mid) {
                    $member = $auth->findUser($mid);
                    if (!$member) {
                        continue;
                    }
                    $personal = $app->space($member, 'me');
                    $keys = array_keys(array_filter((array) $state($personal, $week)['moved'], fn($h) => $h === $space['household']));
                    if (!$keys) {
                        continue;
                    }
                    $theirs = $needed($member, $personal, $week);
                    foreach ($keys as $k) {
                        if (isset($theirs[$k]) && !isset($skip[Util::lower(Util::squash($theirs[$k]['name']))])) {
                            $merge($items, $theirs[$k], $names[$mid] ?? null);
                        }
                    }
                }
            }
            foreach ($st['extra'] as $x) {
                $k = 'x:' . $x['id'];
                $items[$k] = ['key' => $k, 'id' => $x['id'], 'name' => $x['name'], 'qty' => $x['qty'], 'unit' => $x['unit'], 'note' => $x['note'],
                    'optional' => false, 'sources' => [], 'from' => array_values(array_filter([$x['from'] ?? null])), 'extra' => true,
                    'by_name' => $names[$x['by']] ?? null];
            }
            // hide the titles of recipes this user may not see (items moved in from someone's private menu)
            $idx = $recipes->index();
            $checked = array_flip($st['checked']);
            $units = [];
            foreach ($items as $it) {
                $units[Util::lower(Util::squash($it['name']))][$it['unit']] = true;
            }
            $out = [];
            foreach ($items as $it) {
                $it['sources'] = array_map(fn($s) => isset($idx[$s['recipe']]) && $app->canView($user, $idx[$s['recipe']]) ? $s : ['title' => null] + $s, $it['sources']);
                $it['qty'] = $it['qty'] === null ? null : round($it['qty'], 2);
                $it['checked'] = isset($checked[$it['key']]);
                $it['mixed'] = count($units[Util::lower(Util::squash($it['name']))]) > 1;
                $it['extra'] = $it['extra'] ?? false;
                $out[] = $it;
            }
            usort($out, fn($a, $b) => [Util::lower($a['name']), $a['unit']] <=> [Util::lower($b['name']), $b['unit']]);
            $spaces = array_map(fn($s) => ['id' => $s['id'], 'name' => $s['name']], $app->spaces($user));
            return [
                'space' => ['id' => $space['id'], 'name' => $space['name']], 'spaces' => $spaces,
                'week' => $week, 'prev' => Util::addDays($week, -7), 'next' => Util::addDays($week, 7),
                'items' => $out, 'moved' => array_values($moved),
                'pantry' => array_column($pantry($space)['items'], 'name'),
            ];
        };

        $spaceOf = fn(array $u, Request $r) => $app->space($u, $r->q('space') ?: $r->str('space', 64));
        $weekIn = fn(Request $r) => $weekOf($r->q('week') ?: $r->str('week', 10));

        $app->get('/shopping', function (Request $r) use ($auth, $spaceOf, $weekIn, $view) {
            $u = $auth->require();
            return $view($u, $spaceOf($u, $r), $weekIn($r));
        });

        $app->post('/shopping/check', function (Request $r) use ($auth, $spaceOf, $weekIn, $saveState, $view) {
            $u = $auth->require();
            $space = $spaceOf($u, $r);
            $week = $weekIn($r);
            $key = $r->str('key', 300);
            $on = !empty($r->json()['checked']);
            $saveState($space, $week, function ($d) use ($key, $on) {
                $d['checked'] = array_values(array_diff($d['checked'], [$key]));
                if ($on) {
                    $d['checked'][] = $key;
                }
                return $d;
            });
            return $view($u, $space, $week);
        });

        // Something to buy that is not in a recipe ("detersivo").
        $app->post('/shopping/extra', function (Request $r) use ($auth, $spaceOf, $weekIn, $saveState, $view) {
            $u = $auth->require();
            $space = $spaceOf($u, $r);
            $week = $weekIn($r);
            $name = Util::squash($r->str('name', 120));
            if ($name === '') {
                throw new HttpError(400, 'item_name_required');
            }
            $qty = Recipes::parseQty($r->json()['qty'] ?? null);
            $x = ['id' => bin2hex(random_bytes(6)), 'name' => $name, 'qty' => $qty, 'unit' => $r->str('unit', 20),
                'note' => $r->str('note', 200), 'by' => $u['id'], 'added' => Util::now()];
            $saveState($space, $week, function ($d) use ($x) {
                $d['extra'][] = $x;
                return $d;
            });
            return $view($u, $space, $week);
        });

        $app->post('/shopping/extra/remove', function (Request $r) use ($auth, $spaceOf, $weekIn, $saveState, $view) {
            $u = $auth->require();
            $space = $spaceOf($u, $r);
            $week = $weekIn($r);
            $id = $r->str('id', 40);
            $saveState($space, $week, function ($d) use ($id) {
                $d['extra'] = array_values(array_filter($d['extra'], fn($x) => $x['id'] !== $id));
                $d['checked'] = array_values(array_diff($d['checked'], ['x:' . $id]));
                return $d;
            });
            return $view($u, $space, $week);
        });

        // Personal list → household list. {week, household, keys: [...] } or {week, household, all: true}.
        // Recipe items are moved "live" (they keep following your private menus); extra items are handed over.
        $app->post('/shopping/move', function (Request $r) use ($app, $auth, $weekIn, $needed, $state, $saveState, $view, $store) {
            $u = $auth->require();
            $me = $app->space($u, 'me');
            $hid = $r->str('household', 64);
            if ($hid === '') {
                throw new HttpError(400, 'household_required');
            }
            $home = $app->space($u, $hid);
            $week = $weekIn($r);
            return $store->locked(function () use ($u, $r, $me, $home, $week, $needed, $state, $saveState, $view) {
                $st = $state($me, $week);
                $all = !empty($r->json()['all']);
                $keys = $all ? array_merge(array_keys($needed($u, $me, $week)), array_map(fn($x) => 'x:' . $x['id'], $st['extra']))
                    : array_values(array_filter((array) ($r->json()['keys'] ?? []), 'is_string'));
                $moved = (array) $st['moved'];
                $handover = [];
                foreach ($keys as $k) {
                    if (str_starts_with($k, 'x:')) {
                        foreach ($st['extra'] as $x) {
                            if ('x:' . $x['id'] === $k) {
                                $handover[] = $x + ['from' => $u['display'] ?: $u['username']];
                            }
                        }
                    } else {
                        $moved[$k] = $home['household'];
                    }
                }
                $ids = array_map(fn($x) => 'x:' . $x['id'], $handover);
                $saveState($me, $week, function ($d) use ($moved, $ids) {
                    $d['moved'] = $moved;
                    $d['extra'] = array_values(array_filter($d['extra'], fn($x) => !in_array('x:' . $x['id'], $ids, true)));
                    $d['checked'] = array_values(array_diff($d['checked'], $ids));
                    return $d;
                });
                if ($handover) {
                    $saveState($home, $week, function ($d) use ($handover) {
                        $d['extra'] = array_merge($d['extra'], $handover);
                        return $d;
                    });
                }
                return $view($u, $me, $week);
            });
        });

        // Undo a move: the items come back to the personal list. {week, keys: [...]}
        $app->post('/shopping/unmove', function (Request $r) use ($app, $auth, $weekIn, $saveState, $view) {
            $u = $auth->require();
            $me = $app->space($u, 'me');
            $week = $weekIn($r);
            $keys = array_values(array_filter((array) ($r->json()['keys'] ?? []), 'is_string'));
            $saveState($me, $week, function ($d) use ($keys) {
                $d['moved'] = array_diff_key((array) $d['moved'], array_flip($keys));
                return $d;
            });
            return $view($u, $me, $week);
        });

        // ---------- pantry ----------

        $app->get('/pantry', function (Request $r) use ($auth, $spaceOf, $pantry) {
            $u = $auth->require();
            return array_column($pantry($spaceOf($u, $r))['items'], 'name');
        });

        $app->post('/pantry', function (Request $r) use ($auth, $spaceOf, $store) {
            $u = $auth->require();
            $space = $spaceOf($u, $r);
            $name = Util::squash($r->str('name', 120));
            if ($name === '') {
                throw new HttpError(400, 'item_name_required');
            }
            $d = $store->update("pantry/{$space['key']}.json", function ($d) use ($name, $u) {
                $lower = array_map(fn($p) => Util::lower($p['name']), $d['items']);
                if (!in_array(Util::lower($name), $lower, true)) {
                    $d['items'][] = ['name' => $name, 'added' => Util::now(), 'by' => $u['id']];
                    usort($d['items'], fn($a, $b) => strcmp(Util::lower($a['name']), Util::lower($b['name'])));
                }
                return $d;
            }, ['format' => 'calderone-pantry/1', 'items' => []]);
            return array_column($d['items'], 'name');
        });

        $app->post('/pantry/remove', function (Request $r) use ($auth, $spaceOf, $store) {
            $u = $auth->require();
            $space = $spaceOf($u, $r);
            $name = Util::lower(Util::squash($r->str('name', 120)));
            $d = $store->update("pantry/{$space['key']}.json", function ($d) use ($name) {
                $d['items'] = array_values(array_filter($d['items'], fn($p) => Util::lower($p['name']) !== $name));
                return $d;
            }, ['format' => 'calderone-pantry/1', 'items' => []]);
            return array_column($d['items'], 'name');
        });

        $app->on('household.deleted', function (string $hid) use ($store) {
            $store->delete("pantry/h-{$hid}.json");
            $store->deleteDir("shopping/h-{$hid}");
        });
        $app->on('user.deleted', function (string $uid) use ($store) {
            $store->delete("pantry/u-{$uid}.json");
            $store->deleteDir("shopping/u-{$uid}");
        });
    },
];
