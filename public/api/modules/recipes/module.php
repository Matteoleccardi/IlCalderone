<?php
declare(strict_types=1);

require_once __DIR__ . '/Recipes.php';

return [
    'name' => 'recipes',
    'label' => 'Ricette',
    'register' => function (App $app) {
        $svc = new Recipes($app);
        $app->services['recipes'] = $svc;
        $auth = $app->auth;

        $detail = function (array $user, array $r) use ($app, $svc) {
            [$parents, $children] = $svc->relatives($user, $r);
            $names = $app->userNames();
            return $r + [
                'can_edit' => $app->canEdit($user, $r),
                'is_owner' => $app->isOwner($user, $r),
                'owner_name' => $names[$r['owner']] ?? null,
                'updated_by_name' => $names[$r['updated_by'] ?? ''] ?? null,
                'parents_info' => $parents,
                'children_info' => $children,
            ];
        };

        $app->get('/recipes', function (Request $r) use ($auth, $svc) {
            return $svc->visible($auth->require(), $r->q('q'), $r->q('mine') === '1');
        });

        // Distinct ingredient names / units / categories among visible recipes (editor autocomplete).
        $app->get('/recipes/vocabulary', function () use ($auth, $svc) {
            $ing = $units = $cats = $tags = [];
            foreach ($svc->visible($auth->require()) as $s) {
                foreach ($s['ingredients'] as $i) { $ing[$i] = true; }
                foreach ($s['units'] as $u) { $units[$u] = true; }
                foreach ($s['tags'] as $t) { $tags[$t] = true; }
                $cats[$s['category']] = true;
            }
            $sorted = function (array $a) { $k = array_keys($a); natcasesort($k); return array_values($k); };
            return ['ingredients' => $sorted($ing), 'units' => $sorted($units + array_flip(['g', 'ml', 'p.', 'tbs', 'q.b.'])),
                'categories' => $sorted($cats), 'tags' => $sorted($tags)];
        });

        $app->get('/recipes/export', function (Request $r) use ($auth, $svc) {
            $u = $auth->require();
            $mine = $r->q('scope', 'mine') === 'mine';
            $out = [];
            foreach ($svc->visible($u, '', $mine) as $s) {
                $out[] = $svc->toExchange($svc->load($s['id']), $r->q('photos', '1') === '1');
            }
            Response::download($out, 'calderone-ricette-' . gmdate('Y-m-d') . '.json');
        });

        $app->post('/recipes/import', function (Request $r) use ($auth, $svc) {
            $u = $auth->require();
            $body = $r->json();
            $items = $body['recipes'] ?? null;
            if (!is_array($items)) {
                throw new HttpError(400, 'import_empty');
            }
            if (isset($items['title'])) {
                $items = [$items]; // a single recipe object
            }
            return $svc->import($u, $items, (string) ($body['visibility'] ?? 'shared'), isset($body['household']) ? (string) $body['household'] : null);
        });

        $app->post('/recipes', function (Request $r) use ($auth, $svc, $detail) {
            $u = $auth->require();
            return $detail($u, $svc->create($u, $r->json()));
        });

        $app->get('/recipes/{id}', function (Request $r, array $p) use ($auth, $svc, $detail) {
            $u = $auth->require();
            return $detail($u, $svc->visibleOr404($u, $p['id']));
        });

        $app->put('/recipes/{id}', function (Request $r, array $p) use ($auth, $svc, $detail, $app) {
            $u = $auth->require();
            return $app->store->locked(fn() => $detail($u, $svc->update($u, $svc->editableOr403($u, $p['id']), $r->json())));
        });

        $app->delete('/recipes/{id}', function (Request $r, array $p) use ($auth, $svc) {
            $u = $auth->require();
            $svc->remove($svc->ownedOr403($u, $p['id']));
            return ['ok' => true];
        });

        // History of in-place edits: list, one old version, restore an old version (as a new version).
        $app->get('/recipes/{id}/history', function (Request $r, array $p) use ($auth, $svc) {
            return $svc->history($svc->visibleOr404($auth->require(), $p['id']));
        });

        $app->get('/recipes/{id}/history/{rev}', function (Request $r, array $p) use ($auth, $svc) {
            $rec = $svc->visibleOr404($auth->require(), $p['id']);
            return $svc->revision($rec, (int) $p['rev']);
        });

        $app->post('/recipes/{id}/history/{rev}/restore', function (Request $r, array $p) use ($auth, $svc, $detail, $app) {
            $u = $auth->require();
            return $app->store->locked(fn() => $detail($u, $svc->restore($u, $svc->editableOr403($u, $p['id']), (int) $p['rev'])));
        });

        $app->post('/recipes/{id}/variant', function (Request $r, array $p) use ($auth, $svc, $detail) {
            $u = $auth->require();
            // the client sends the word for "variant" in the user's language, used in the copy's title
            $word = $r->str('label', 30) ?: 'variante';
            return $detail($u, $svc->createVariant($u, $svc->visibleOr404($u, $p['id']), " ({$word})"));
        });

        // Link this recipe (child, must be yours) to another visible recipe as its parent.
        $app->post('/recipes/{id}/parents', function (Request $r, array $p) use ($auth, $svc, $detail, $app) {
            $u = $auth->require();
            return $app->store->locked(function () use ($u, $r, $p, $svc, $detail) {
                $child = $svc->ownedOr403($u, $p['id']);
                $parent = $svc->visibleOr404($u, $r->str('parent', 64));
                return $detail($u, $svc->save($svc->withParent($child, $parent['id'], $r->str('kind', 20, 'variant'), $r->str('note', 200))));
            });
        });

        $app->delete('/recipes/{id}/parents/{pid}', function (Request $r, array $p) use ($auth, $svc, $detail, $app) {
            $u = $auth->require();
            return $app->store->locked(function () use ($u, $p, $svc, $detail) {
                $child = $svc->ownedOr403($u, $p['id']);
                $child['parents'] = array_values(array_filter($child['parents'], fn($x) => $x['id'] !== $p['pid']));
                return $detail($u, $svc->save($child));
            });
        });

        $app->get('/recipes/{id}/json', function (Request $r, array $p) use ($auth, $svc) {
            $rec = $svc->visibleOr404($auth->require(), $p['id']);
            $slug = trim(preg_replace('/[^a-z0-9]+/', '-', Util::lower($rec['title'])) ?? 'ricetta', '-');
            Response::download($svc->toExchange($rec, true), ($slug ?: 'ricetta') . '.json');
        });

        $app->get('/recipes/{id}/photo', function (Request $r, array $p) use ($auth, $svc, $app) {
            $rec = $svc->visibleOr404($auth->require(), $p['id']);
            $file = $rec['photo'] ? $app->store->path('media/' . basename($rec['photo'])) : null;
            if (!$file || !is_file($file)) {
                throw new HttpError(404, 'photo_none');
            }
            Response::file($file, Recipes::MIME[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream');
        });

        $app->post('/recipes/{id}/photo', function (Request $r, array $p) use ($auth, $svc, $detail, $app) {
            $u = $auth->require();
            if (empty($_FILES['photo'])) {
                throw new HttpError(400, 'photo_missing');
            }
            return $detail($u, $svc->savePhoto($svc->editableOr403($u, $p['id']), $_FILES['photo'], (int) $app->config['max_upload']));
        });

        $app->delete('/recipes/{id}/photo', function (Request $r, array $p) use ($auth, $svc, $detail) {
            $u = $auth->require();
            return $detail($u, $svc->save($svc->deletePhoto($svc->editableOr403($u, $p['id']))));
        });
    },
];
