<?php
declare(strict_types=1);

// Ratings: every user gives a recipe up to two opinions, "taste" (how good it is) and "ease" (how simple it is to make),
// from 0.5 to 5 stars in steps of 0.5. A household sees the average of the members who actually voted on each of the two.
// Anyone who can see a recipe may rate it. Votes are private: other people only ever see the averages of the households
// they share with the voters, never who voted what.
// data/ratings/<recipeId>.json = {format, recipe, votes{<userId>: {taste?, ease?, updated}}}
return [
    'name' => 'ratings',
    'label' => 'Valutazioni',
    'requires' => ['recipes'],
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        /** @var Recipes $recipes */
        $recipes = $app->services['recipes'];
        $KEYS = ['taste', 'ease'];
        $empty = fn(string $rid) => ['format' => 'calderone-ratings/1', 'recipe' => $rid, 'votes' => []];

        /** {avg, n} of one criterion over the given users, counting only those who voted on it; null if nobody did. */
        $average = function (array $votes, array $uids, string $key): ?array {
            $vals = [];
            foreach ($uids as $uid) {
                if (isset($votes[$uid][$key])) {
                    $vals[] = (float) $votes[$uid][$key];
                }
            }
            return $vals ? ['avg' => round(array_sum($vals) / count($vals), 2), 'n' => count($vals)] : null;
        };
        $mine = fn(array $votes, string $uid) => ['taste' => $votes[$uid]['taste'] ?? null, 'ease' => $votes[$uid]['ease'] ?? null];

        $view = function (array $u, string $rid) use ($app, $store, $empty, $average, $mine, $KEYS) {
            $votes = $store->read("ratings/{$rid}.json", $empty($rid))['votes'];
            $hh = [];
            foreach ($app->householdIds($u) as $hid) {
                $members = $app->memberIds($hid);
                $row = ['id' => $hid, 'name' => $app->household($hid)['name'], 'members' => count($members)];
                foreach ($KEYS as $k) {
                    $row[$k] = $average($votes, $members, $k);
                }
                if ($row['taste'] || $row['ease']) {
                    $hh[] = $row;   // a family where nobody voted is not listed
                }
            }
            return ['mine' => $mine($votes, $u['id']), 'households' => $hh];
        };

        $app->get('/recipes/{id}/rating', function (Request $r, array $p) use ($auth, $recipes, $view) {
            $u = $auth->require();
            $recipes->visibleOr404($u, $p['id']);
            return $view($u, $p['id']);
        });

        // body {taste?: 0.5..5 | null, ease?: 0.5..5 | null}: a missing key stays, null removes that opinion
        $app->put('/recipes/{id}/rating', function (Request $r, array $p) use ($auth, $recipes, $view, $store, $empty, $KEYS) {
            $u = $auth->require();
            $recipes->visibleOr404($u, $p['id']);
            $body = $r->json();
            $new = [];
            foreach ($KEYS as $k) {
                if (!array_key_exists($k, $body)) {
                    continue;
                }
                $v = $body[$k];
                if ($v !== null && (!(is_int($v) || is_float($v)) || $v < 0.5 || $v > 5 || fmod($v * 2, 1.0) != 0.0)) {
                    throw new HttpError(400, 'rating_invalid');
                }
                $new[$k] = $v === null ? null : (float) $v;
            }
            $rid = $p['id'];
            $store->locked(function () use ($store, $rid, $u, $new, $empty, $KEYS) {
                $f = $store->read("ratings/{$rid}.json", $empty($rid));
                $mine = $f['votes'][$u['id']] ?? [];
                foreach ($new as $k => $v) {
                    if ($v === null) {
                        unset($mine[$k]);
                    } else {
                        $mine[$k] = $v;
                    }
                }
                if (isset($mine['taste']) || isset($mine['ease'])) {
                    $f['votes'][$u['id']] = array_intersect_key($mine, array_flip($KEYS)) + ['updated' => Util::now()];
                } else {
                    unset($f['votes'][$u['id']]);
                }
                if ($f['votes']) {
                    $store->write("ratings/{$rid}.json", $f);
                } else {
                    $store->delete("ratings/{$rid}.json");
                }
            });
            return $view($u, $rid);
        });

        // For the list: per visible recipe that has any vote of me or of my peers (me + everyone I share a household with):
        // {mine: {taste, ease}, family: {taste: {avg, n}|null, ease: ...}}
        $app->get('/ratings/summary', function () use ($auth, $app, $store, $recipes, $average, $mine, $KEYS) {
            $u = $auth->require();
            $peers = $app->peerIds($u);
            $idx = $recipes->index();
            $out = [];
            foreach ($store->list('ratings') as $rid) {
                if (!isset($idx[$rid]) || !$app->canView($u, $idx[$rid])) {
                    continue;
                }
                $votes = $store->read("ratings/{$rid}.json")['votes'] ?? [];
                $row = ['mine' => $mine($votes, $u['id'])];
                foreach ($KEYS as $k) {
                    $row['family'][$k] = $average($votes, $peers, $k);
                }
                if ($row['mine']['taste'] !== null || $row['mine']['ease'] !== null || $row['family']['taste'] || $row['family']['ease']) {
                    $out[$rid] = $row;
                }
            }
            return (object) $out;   // {} when empty (a PHP [] would be a JSON list)
        });

        $app->on('recipe.deleted', fn(string $rid) => $store->delete("ratings/{$rid}.json"));
        $app->on('user.deleted', function (string $uid) use ($store) {
            foreach ($store->list('ratings') as $rid) {
                $store->update("ratings/{$rid}.json", function ($f) use ($uid) {
                    unset($f['votes'][$uid]);
                    return $f;
                });
                if (!($store->read("ratings/{$rid}.json")['votes'] ?? [])) {
                    $store->delete("ratings/{$rid}.json");
                }
            }
        });
    },
];
